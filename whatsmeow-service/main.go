// ─────────────────────────────────────────────────────────────────────────────
// whatsmeow-service/main.go
//
// Standalone Go microservice that owns the WhatsApp connection (via whatsmeow)
// for the Inventra Decent app. Your existing Node/Express backend talks to
// this over plain HTTP on localhost — it never needs to be reachable from
// the internet directly.
//
// ENDPOINTS (all internal — protected by a shared secret header):
//   GET  /healthz                 -> {ok:true}
//   GET  /session/status          -> {status, qr?, phone?}
//   POST /session/start           -> begins pairing, generates QR codes
//   POST /session/logout          -> unlinks the device
//   POST /messages/send-text      -> {phone, message}
//   POST /messages/send-media     -> multipart: file, phone, caption
//
// RUN:
//   go mod tidy
//   go run .
//
// ENV VARS:
//   PORT              (default 8081)
//   WA_INTERNAL_KEY   shared secret, must match Node's WA_INTERNAL_KEY
//   WA_DB_PATH        sqlite file for the linked-device session (default ./wa_session.db)
// ─────────────────────────────────────────────────────────────────────────────
package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/joho/godotenv"
	"github.com/skip2/go-qrcode"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"

	_ "modernc.org/sqlite" // pure-Go sqlite driver, registers as "sqlite"
)

// ── shared session state, guarded by a mutex since HTTP handlers and the
//    whatsmeow event loop run on different goroutines ─────────────────────
type sessionState struct {
	mu     sync.RWMutex
	status string // "disconnected" | "connecting" | "qr" | "connected" | "error"
	qr     string // base64 PNG, only set while status == "qr"
	phone  string // set once status == "connected"
	errMsg string
}

func (s *sessionState) set(status, qr, phone, errMsg string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.status = status
	s.qr = qr
	s.phone = phone
	s.errMsg = errMsg
}

func (s *sessionState) snapshot() map[string]string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return map[string]string{"status": s.status, "qr": s.qr, "phone": s.phone, "error": s.errMsg}
}

var (
	state     = &sessionState{status: "disconnected"}
	clientMu  sync.RWMutex
	client    *whatsmeow.Client
	container *sqlstore.Container
)

func getClient() *whatsmeow.Client {
	clientMu.RLock()
	defer clientMu.RUnlock()
	return client
}

func setClient(c *whatsmeow.Client) {
	clientMu.Lock()
	defer clientMu.Unlock()
	client = c
}

// resetToFreshDevice swaps in a brand new, empty device + client. Needed
// whenever the current device's row has been (or might have been) deleted
// from the store — reusing the old *whatsmeow.Client afterward is exactly
// what causes "invalid use of deleted device" errors/panics. This can happen
// two ways:
//   1. We call client.Logout() ourselves (see handleLogout).
//   2. WhatsApp invalidates the session from the *phone's* side (user removes
//      the linked device, session expires, etc.) — whatsmeow detects this,
//      fires a LoggedOut event, and deletes the device row internally on its
//      own, without us calling Logout() at all (see eventHandler below).
// Both paths must end up here so the next /session/start always has a valid
// device to build a new QR channel from.
func resetToFreshDevice(reason string) {
	log.Printf("resetting to a fresh WhatsApp device (%s)", reason)
	oldClient := getClient()
	if oldClient != nil {
		oldClient.RemoveEventHandlers()
		oldClient.Disconnect()
	}
	newDevice := container.NewDevice()
	newClient := whatsmeow.NewClient(newDevice, waLog.Stdout("Client", "ERROR", true))
	newClient.AddEventHandler(eventHandler)
	setClient(newClient)
}

func main() {
	// Load whatsmeow-service/.env into real process env vars. Unlike Node's
	// dotenv, Go does nothing with a .env file unless we explicitly load it
	// like this — without this call, os.Getenv() below would never see
	// values from the .env file at all.
	if err := godotenv.Load(); err != nil {
		log.Printf("no .env file found (or failed to load): %v — falling back to real env vars / defaults", err)
	}

	port := getEnv("PORT", "8081")
	internalKey := getEnv("WA_INTERNAL_KEY", "change-me-internal-key")
	dbPath := getEnv("WA_DB_PATH", "./wa_session.db")

	if internalKey == "change-me-internal-key" {
		log.Println("WARNING: WA_INTERNAL_KEY is using the default placeholder — set it in .env to match your Node backend's value")
	}

	ctx := context.Background()
	dbLog := waLog.Stdout("DB", "ERROR", true)
	var err error
	container, err = sqlstore.New(ctx, "sqlite", fmt.Sprintf("file:%s?_pragma=foreign_keys(1)", dbPath), dbLog)
	if err != nil {
		log.Fatalf("failed to open session store: %v", err)
	}

	device, err := container.GetFirstDevice(ctx)
	if err != nil {
		log.Fatalf("failed to load device: %v", err)
	}

	clientLog := waLog.Stdout("Client", "ERROR", true)
	setClient(whatsmeow.NewClient(device, clientLog))
	getClient().AddEventHandler(eventHandler)

	// If a device is already linked from a previous run, reconnect silently
	// on boot instead of waiting for a manual "start" call.
	if getClient().Store.ID != nil {
		state.set("connecting", "", "", "")
		go func() {
			c := getClient()
			if err := c.Connect(); err != nil {
				log.Printf("reconnect failed: %v", err)
				state.set("error", "", "", err.Error())
				return
			}
			state.set("connected", "", c.Store.ID.User, "")
		}()
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]bool{"ok": true})
	})
	mux.HandleFunc("/session/status", recoverMiddleware(requireKey(internalKey, handleStatus)))
	mux.HandleFunc("/session/start", recoverMiddleware(requireKey(internalKey, handleStart)))
	mux.HandleFunc("/session/logout", recoverMiddleware(requireKey(internalKey, handleLogout)))
	mux.HandleFunc("/messages/send-text", recoverMiddleware(requireKey(internalKey, handleSendText)))
	mux.HandleFunc("/messages/send-media", recoverMiddleware(requireKey(internalKey, handleSendMedia)))

	log.Printf("whatsmeow-service listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}

// ── recover middleware: whatsmeow can panic on certain edge cases (e.g.
//    calling methods on a device that's been deleted from the store). Without
//    this, a panic tears down the TCP connection for that request, which
//    looks to the frontend like "the request failed weirdly" and often gets
//    retried immediately — turning one bad state into a flood of failures.
//    This turns any such panic into a normal JSON 500 instead. ─────────────
func recoverMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				msg := fmt.Sprintf("%v", rec)
				log.Printf("recovered from panic in %s: %v", r.URL.Path, rec)

				if strings.Contains(strings.ToLower(msg), "deleted device") {
					// Self-heal: this exact panic means the current client's
					// device row is gone, so every future call will panic
					// the same way until we swap it out. Do that now instead
					// of leaving the service stuck.
					resetToFreshDevice("recovered panic: " + msg)
					state.set("disconnected", "", "", "WhatsApp session was invalidated — scan a new QR code to reconnect")
				} else {
					state.set("error", "", "", "internal error: "+msg)
				}

				writeJSON(w, 500, map[string]string{"error": "internal error: " + msg})
			}
		}()
		next(w, r)
	}
}

// ── auth middleware: simple shared-secret header, since this service only
//    needs to trust your Node backend, not the public internet ───────────
func requireKey(key string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Internal-Key") != key {
			writeJSON(w, 401, map[string]string{"error": "unauthorized"})
			return
		}
		next(w, r)
	}
}

// ── GET /session/status ────────────────────────────────────────────────────
func handleStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, state.snapshot())
}

// ── POST /session/start ───────────────────────────────────────────────────
func handleStart(w http.ResponseWriter, r *http.Request) {
	c := getClient()
	if c.IsConnected() && c.IsLoggedIn() {
		writeJSON(w, 200, state.snapshot())
		return
	}

	if c.Store.ID != nil {
		// We have a stored session but aren't connected — just reconnect,
		// no new QR needed.
		state.set("connecting", "", "", "")
		go func() {
			if err := c.Connect(); err != nil {
				state.set("error", "", "", err.Error())
				return
			}
			state.set("connected", "", c.Store.ID.User, "")
		}()
		writeJSON(w, 200, map[string]string{"status": "connecting"})
		return
	}

	qrChan, err := c.GetQRChannel(context.Background())
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}

	state.set("connecting", "", "", "")

	go func() {
		if err := c.Connect(); err != nil {
			state.set("error", "", "", err.Error())
		}
	}()

	go func() {
		for evt := range qrChan {
			switch evt.Event {
			case "code":
				png, err := qrcode.Encode(evt.Code, qrcode.Medium, 320)
				if err != nil {
					state.set("error", "", "", "failed to render QR: "+err.Error())
					continue
				}
				state.set("qr", base64.StdEncoding.EncodeToString(png), "", "")
			case "success":
				phone := ""
				if c.Store.ID != nil {
					phone = c.Store.ID.User
				}
				state.set("connected", "", phone, "")
			case "timeout":
				state.set("disconnected", "", "", "QR code expired, please try again")
			default:
				state.set("error", "", "", "pairing failed: "+evt.Event)
			}
		}
	}()

	writeJSON(w, 200, map[string]string{"status": "connecting"})
}

// ── POST /session/logout ──────────────────────────────────────────────────
func handleLogout(w http.ResponseWriter, r *http.Request) {
	c := getClient()
	if c.Store.ID != nil {
		if err := c.Logout(context.Background()); err != nil {
			log.Printf("logout error: %v", err)
		}
	}
	resetToFreshDevice("manual logout")
	state.set("disconnected", "", "", "")
	writeJSON(w, 200, map[string]string{"status": "disconnected"})
}

// ── whatsmeow event handler: keep our state in sync with real connection
//    drops (phone battery dead, user unlinked from phone, etc.) ───────────
func eventHandler(evt interface{}) {
	switch v := evt.(type) {
	case *events.Disconnected:
		state.set("disconnected", "", "", "")
	case *events.LoggedOut:
		// WhatsApp invalidated this session from the phone's side (unlinked,
		// expired, etc.). whatsmeow deletes the device row internally when
		// this fires — so we must swap to a fresh device/client here too,
		// exactly like handleLogout does, or the next status/start call
		// hits the same "invalid use of deleted device" problem.
		log.Printf("device logged out from phone: %v", v.Reason)
		go resetToFreshDevice("LoggedOut event from phone")
		state.set("disconnected", "", "", "unlinked from phone — scan a new QR code to reconnect")
	}
}

// ── POST /messages/send-text  { phone, message } ──────────────────────────
func handleSendText(w http.ResponseWriter, r *http.Request) {
	c := getClient()
	if !c.IsLoggedIn() {
		writeJSON(w, 409, map[string]string{"error": "WhatsApp is not connected"})
		return
	}

	var body struct {
		Phone   string `json:"phone"`
		Message string `json:"message"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid JSON body"})
		return
	}
	if body.Phone == "" || body.Message == "" {
		writeJSON(w, 400, map[string]string{"error": "phone and message are required"})
		return
	}

	jid := buildJID(body.Phone)
	_, err := c.SendMessage(context.Background(), jid, &waE2E.Message{
		Conversation: proto.String(body.Message),
	})
	if err != nil {
		writeJSON(w, 502, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]bool{"success": true})
}

// ── POST /messages/send-media  (multipart: file, phone, caption) ─────────
func handleSendMedia(w http.ResponseWriter, r *http.Request) {
	c := getClient()
	if !c.IsLoggedIn() {
		writeJSON(w, 409, map[string]string{"error": "WhatsApp is not connected"})
		return
	}

	if err := r.ParseMultipartForm(20 << 20); err != nil { // 20 MB max
		writeJSON(w, 400, map[string]string{"error": "failed to parse form: " + err.Error()})
		return
	}

	phone := r.FormValue("phone")
	caption := r.FormValue("caption")
	if phone == "" {
		writeJSON(w, 400, map[string]string{"error": "phone is required"})
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, 400, map[string]string{"error": "file is required: " + err.Error()})
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}

	jid := buildJID(phone)
	ctx := context.Background()

	// Send the caption as its own text message first. This keeps the
	// document upload below simple/version-proof instead of depending on
	// whether this whatsmeow version's DocumentMessage proto has a Caption
	// field. Two messages arriving back-to-back reads perfectly fine in
	// WhatsApp anyway.
	if caption != "" {
		if _, err := c.SendMessage(ctx, jid, &waE2E.Message{
			Conversation: proto.String(caption),
		}); err != nil {
			log.Printf("warning: caption send failed: %v", err)
		}
	}

	ext := strings.ToLower(filepath.Ext(header.Filename))
	mimeType := mime.TypeByExtension(ext)
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	if isImageExt(ext) {
		resp, err := c.Upload(ctx, data, whatsmeow.MediaImage)
		if err != nil {
			writeJSON(w, 502, map[string]string{"error": "upload failed: " + err.Error()})
			return
		}
		_, err = c.SendMessage(ctx, jid, &waE2E.Message{
			ImageMessage: &waE2E.ImageMessage{
				Mimetype:      proto.String(mimeType),
				URL:           proto.String(resp.URL),
				DirectPath:    proto.String(resp.DirectPath),
				MediaKey:      resp.MediaKey,
				FileEncSHA256: resp.FileEncSHA256,
				FileSHA256:    resp.FileSHA256,
				FileLength:    proto.Uint64(resp.FileLength),
			},
		})
		if err != nil {
			writeJSON(w, 502, map[string]string{"error": "send failed: " + err.Error()})
			return
		}
	} else {
		resp, err := c.Upload(ctx, data, whatsmeow.MediaDocument)
		if err != nil {
			writeJSON(w, 502, map[string]string{"error": "upload failed: " + err.Error()})
			return
		}
		_, err = c.SendMessage(ctx, jid, &waE2E.Message{
			DocumentMessage: &waE2E.DocumentMessage{
				Mimetype:      proto.String(mimeType),
				Title:         proto.String(header.Filename),
				FileName:      proto.String(header.Filename),
				URL:           proto.String(resp.URL),
				DirectPath:    proto.String(resp.DirectPath),
				MediaKey:      resp.MediaKey,
				FileEncSHA256: resp.FileEncSHA256,
				FileSHA256:    resp.FileSHA256,
				FileLength:    proto.Uint64(resp.FileLength),
			},
		})
		if err != nil {
			writeJSON(w, 502, map[string]string{"error": "send failed: " + err.Error()})
			return
		}
	}

	writeJSON(w, 200, map[string]bool{"success": true})
}

// ── helpers ────────────────────────────────────────────────────────────────
func isImageExt(ext string) bool {
	switch ext {
	case ".jpg", ".jpeg", ".png", ".webp":
		return true
	default:
		return false
	}
}

func buildJID(phone string) types.JID {
	digits := onlyDigits(phone)
	return types.NewJID(digits, types.DefaultUserServer)
}

func onlyDigits(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	out := b.String()
	// bare 10-digit numbers are assumed Indian, same convention as the
	// frontend's normalizePhone() in WhatsAppSender.jsx
	if len(out) == 10 {
		out = "91" + out
	}
	return out
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}