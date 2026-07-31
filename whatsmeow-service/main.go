// ─────────────────────────────────────────────────────────────────────────────
// whatsmeow-service/main.go
//
// Standalone Go microservice that owns the WhatsApp connections (via whatsmeow)
// for the Inventra Decent app. Your existing Node/Express backend talks to
// this over plain HTTP on localhost — it never needs to be reachable from
// the internet directly.
//
// MULTI-TENANT: one linked WhatsApp number per ACCOUNT (the `account` table /
// JWT `aid` claim — NOT per organization and NOT per user). Every request must
// carry the account id in the X-Tenant-Id header; the Node backend sets that
// from the verified JWT (req.user.aid), never from client input. Consequences:
//   - Account A's admin scans once; every user in account A (all orgs, all
//     devices, all browsers) then sends from that one linked number with no
//     further scanning.
//   - Account B gets its own, separate QR code and links its own phone.
//   - Neither can see or use the other's session.
//
// ENDPOINTS (all internal — protected by a shared secret header):
//
//	GET  /healthz                 -> {ok:true}          (no key, no tenant)
//	GET  /session/status          -> {status, socket, qr?, phone?}
//	POST /session/start           -> begins pairing, generates QR codes
//	POST /session/logout          -> unlinks the device
//	POST /messages/send-text      -> {phone, message}
//	POST /messages/send-media     -> multipart: file, phone, caption
//
// RUN:
//
//	go mod tidy
//	go run .
//
// ENV VARS:
//
//	PORT              (default 8081)
//	WA_INTERNAL_KEY   shared secret, must match Node's WA_INTERNAL_KEY
//	WA_DEVICE_NAME    name shown on the phone's Linked Devices list
//	                  (default "InventraDecent session")
//	WA_DB_DRIVER      "sqlite" (default) or "postgres"
//	WA_DB_PATH        sqlite file (default ./wa_session.db)
//	WA_DB_DSN         required when WA_DB_DRIVER=postgres
//	WA_IDLE_TIMEOUT   minutes a linked-but-unused session stays connected
//	                  before its socket is dropped to save memory.
//	                  0 disables idle disconnect. (default 15)
//	WA_ADOPT_EXISTING_TENANT
//	                  one-time migration off the old single-tenant service:
//	                  the account id that owns the device already in the store
//	                  (use "1" for the original install). See
//	                  adoptLegacyDevice. Unset = no migration.
//
// ─────────────────────────────────────────────────────────────────────────────
package main

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/joho/godotenv"
	"github.com/skip2/go-qrcode"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"

	"github.com/lib/pq"    // pure-Go postgres driver, registers as "postgres"
	_ "modernc.org/sqlite" // pure-Go sqlite driver, registers as "sqlite"
)

// Statuses the Node backend / frontend switch on. Keep these strings stable —
// WhatsAppSender.jsx compares against them literally.
const (
	statusDisconnected = "disconnected" // no device linked for this account
	statusConnecting   = "connecting"   // pairing or reconnecting, no QR yet
	statusQR           = "qr"           // QR code available to scan
	statusConnected    = "connected"    // a device IS linked to this account
	statusError        = "error"
)

// errNotLinked is what send handlers get when the account has never paired.
var errNotLinked = errors.New("this account has no linked WhatsApp number yet")

// How long a send is willing to wait for an idle session's socket to come
// back up before giving up and returning an error to the caller.
const reconnectWait = 20 * time.Second

// ── tenantSession: everything owned by ONE account ────────────────────────────
// Locking rule: never call into whatsmeow while holding ts.mu. Read the
// *whatsmeow.Client pointer out under the lock, release, then use it. whatsmeow
// takes its own internal locks and dispatches events on its own goroutines
// (which come back into our event handler and want ts.mu), so holding ts.mu
// across a library call is how you get a deadlock.
type tenantSession struct {
	tenantID string

	mu     sync.RWMutex
	client *whatsmeow.Client
	status string
	qr     string // base64 PNG, only set while status == statusQR
	phone  string
	errMsg string

	pairing    bool               // a QR pairing attempt is in flight
	pairCancel context.CancelFunc // cancels that attempt's QR channel
	lastUsed   time.Time
}

func (ts *tenantSession) getClient() *whatsmeow.Client {
	ts.mu.RLock()
	defer ts.mu.RUnlock()
	return ts.client
}

func (ts *tenantSession) setState(status, qr, phone, errMsg string) {
	ts.mu.Lock()
	defer ts.mu.Unlock()
	ts.status = status
	ts.qr = qr
	ts.phone = phone
	ts.errMsg = errMsg
}

func (ts *tenantSession) touch() {
	ts.mu.Lock()
	ts.lastUsed = time.Now()
	ts.mu.Unlock()
}

// snapshot is what GET /session/status returns.
//
// `status` answers "does this account have a linked number?" — NOT "is the
// websocket up right now". Those are deliberately different questions: an idle
// session whose socket we dropped to save memory is still linked, and showing
// its admin a fresh QR code would be wrong (they'd re-pair for no reason).
// Sends transparently reconnect, so linked == connected as far as the UI cares.
// `socket` reports the live connection state separately, for diagnostics.
func (ts *tenantSession) snapshot() map[string]any {
	ts.mu.RLock()
	c := ts.client
	status, qr, phone, errMsg := ts.status, ts.qr, ts.phone, ts.errMsg
	ts.mu.RUnlock()

	socket := "offline"
	linked := false
	if c != nil {
		if c.Store.ID != nil {
			linked = true
			if phone == "" {
				phone = c.Store.ID.User
			}
		}
		if c.IsConnected() && c.IsLoggedIn() {
			socket = "online"
		}
	}

	// Don't override an in-progress pairing — during pairing the device isn't
	// linked yet anyway, but be explicit rather than relying on that.
	if linked && status != statusQR && status != statusConnecting {
		status = statusConnected
	}

	return map[string]any{
		"tenant": ts.tenantID,
		"status": status,
		"qr":     qr,
		"phone":  phone,
		"socket": socket,
		"error":  errMsg,
	}
}

// ensureConnected brings an idle-but-linked session's socket back up. Called
// before every send. Returns errNotLinked if the account never paired, so the
// caller can tell "you need to scan a QR" apart from "WhatsApp is having a
// bad day".
func (ts *tenantSession) ensureConnected() error {
	c := ts.getClient()
	if c == nil {
		return errNotLinked
	}
	if c.Store.ID == nil {
		return errNotLinked
	}
	if c.IsConnected() && c.IsLoggedIn() {
		ts.touch()
		return nil
	}

	if err := c.Connect(); err != nil && !errors.Is(err, whatsmeow.ErrAlreadyConnected) {
		return fmt.Errorf("could not reconnect WhatsApp: %w", err)
	}

	// Connect() returning nil only means the socket opened — the server still
	// has to accept our stored credentials before we may send. Poll for the
	// logged-in handshake rather than assuming it's instant.
	deadline := time.Now().Add(reconnectWait)
	for time.Now().Before(deadline) {
		if c.IsConnected() && c.IsLoggedIn() {
			ts.touch()
			return nil
		}
		time.Sleep(200 * time.Millisecond)
	}
	return errors.New("timed out reconnecting this account's WhatsApp session")
}

// disconnectIfIdle drops the socket of a linked session nobody has used in a
// while. This is the whole reason one small box can host many tenants: an
// idle tenant costs a database row instead of a live websocket + keepalives.
// Credentials stay in the store, so the next send silently reconnects — the
// user never sees a QR code again.
func (ts *tenantSession) disconnectIfIdle(idle time.Duration) {
	ts.mu.RLock()
	c := ts.client
	pairing := ts.pairing
	last := ts.lastUsed
	ts.mu.RUnlock()

	if c == nil || pairing || c.Store.ID == nil {
		return
	}
	if time.Since(last) < idle {
		return
	}
	if !c.IsConnected() {
		return
	}
	log.Printf("[tenant %s] idle for %s — dropping socket (still linked, will reconnect on next send)",
		ts.tenantID, time.Since(last).Round(time.Second))
	c.Disconnect()
}

// cancelPairing tears down an in-flight QR attempt.
func (ts *tenantSession) cancelPairing() {
	ts.mu.Lock()
	cancel := ts.pairCancel
	ts.pairCancel = nil
	ts.pairing = false
	ts.mu.Unlock()
	if cancel != nil {
		cancel()
	}
}

// ── registry: tenantID -> session ────────────────────────────────────────────
type registry struct {
	mu        sync.Mutex
	sessions  map[string]*tenantSession
	container *sqlstore.Container
	mappings  *mappingStore
}

func newRegistry(container *sqlstore.Container, mappings *mappingStore) *registry {
	return &registry{
		sessions:  make(map[string]*tenantSession),
		container: container,
		mappings:  mappings,
	}
}

func (r *registry) list() []*tenantSession {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]*tenantSession, 0, len(r.sessions))
	for _, ts := range r.sessions {
		out = append(out, ts)
	}
	return out
}

// getOrCreate returns the account's session, building it from the stored device
// (so a restart doesn't force a re-scan) or from a fresh empty device.
//
// The registry lock is held across two small local DB reads. That's deliberate:
// it makes "two requests for the same new tenant arrive at once" impossible to
// get wrong, and these queries are local and indexed. If tenant counts ever get
// large enough for this to show up in latency, switch to a per-tenant init lock.
func (r *registry) getOrCreate(ctx context.Context, tenantID string) (*tenantSession, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if ts, ok := r.sessions[tenantID]; ok {
		return ts, nil
	}

	device, err := r.resolveDevice(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	ts := &tenantSession{
		tenantID: tenantID,
		status:   statusDisconnected,
		lastUsed: time.Now(),
	}
	ts.client = whatsmeow.NewClient(device, waLog.Stdout("Client/"+tenantID, "ERROR", true))
	ts.client.AddEventHandler(r.eventHandler(ts))
	if device.ID != nil {
		ts.status = statusConnected
		ts.phone = device.ID.User
	}
	r.sessions[tenantID] = ts
	return ts, nil
}

// pruneIdleUnlinked drops sessions for accounts that only ever *looked* at the
// WhatsApp screen without pairing. Every GET /session/status for an unlinked
// account builds an in-memory client + empty device, and nothing else would
// ever remove it — over months of a growing tenant list that's an unbounded
// map. Pruning is safe because a pruned account is rebuilt from scratch on its
// next request, and by definition it has no credentials to lose.
func (r *registry) pruneIdleUnlinked(idle time.Duration) {
	r.mu.Lock()
	defer r.mu.Unlock()

	for tenantID, ts := range r.sessions {
		ts.mu.RLock()
		c := ts.client
		pairing := ts.pairing
		last := ts.lastUsed
		ts.mu.RUnlock()

		// Keep anything linked (that's real state), mid-pairing (a QR is on
		// screen right now), or recently used.
		if c == nil || pairing || c.Store.ID != nil || time.Since(last) < idle {
			continue
		}
		c.RemoveEventHandlers()
		c.Disconnect()
		delete(r.sessions, tenantID)
	}
}

// resolveDevice maps an account id to its whatsmeow device row.
func (r *registry) resolveDevice(ctx context.Context, tenantID string) (*store.Device, error) {
	jidStr, err := r.mappings.get(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("failed to read session mapping: %w", err)
	}
	if jidStr == "" {
		return r.container.NewDevice(), nil
	}

	jid, err := types.ParseJID(jidStr)
	if err != nil {
		log.Printf("[tenant %s] stored device JID %q is unparseable — starting fresh", tenantID, jidStr)
		_ = r.mappings.delete(ctx, tenantID)
		return r.container.NewDevice(), nil
	}

	device, err := r.container.GetDevice(ctx, jid)
	if err != nil {
		return nil, fmt.Errorf("failed to load device %s: %w", jid, err)
	}
	if device == nil {
		// Mapping row outlived the device row (store wiped, device deleted
		// out-of-band). Drop the stale mapping so this account gets a clean QR.
		log.Printf("[tenant %s] mapped device %s no longer in store — starting fresh", tenantID, jid)
		_ = r.mappings.delete(ctx, tenantID)
		return r.container.NewDevice(), nil
	}
	return device, nil
}

// swapInFreshDevice gives a tenant a brand new, empty device + client. Needed
// whenever the current device's row has been (or might have been) deleted from
// the store — reusing the old *whatsmeow.Client afterward is exactly what
// causes "invalid use of deleted device" errors/panics. Three ways to get here:
//  1. We call client.Logout() ourselves (see handleLogout).
//  2. WhatsApp invalidates the session from the phone's side (user removes the
//     linked device, session expires). whatsmeow fires LoggedOut and deletes
//     the device row itself, without us calling Logout at all.
//  3. We recover a "deleted device" panic in safeGo / recoverMiddleware.
//
// All three must end up here so the next /session/start has a valid device to
// build a QR channel from.
func (r *registry) swapInFreshDevice(ts *tenantSession, reason string) {
	log.Printf("[tenant %s] resetting to a fresh WhatsApp device (%s)", ts.tenantID, reason)

	ts.cancelPairing()

	old := ts.getClient()
	if old != nil {
		old.RemoveEventHandlers()
		old.Disconnect()
	}

	// The mapping is dead too — clear it so a restart doesn't try to reload a
	// device that isn't there.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := r.mappings.delete(ctx, ts.tenantID); err != nil {
		log.Printf("[tenant %s] failed to clear session mapping: %v", ts.tenantID, err)
	}

	fresh := whatsmeow.NewClient(r.container.NewDevice(), waLog.Stdout("Client/"+ts.tenantID, "ERROR", true))
	fresh.AddEventHandler(r.eventHandler(ts))

	ts.mu.Lock()
	ts.client = fresh
	ts.status = statusDisconnected
	ts.qr = ""
	ts.phone = ""
	ts.mu.Unlock()
}

// eventHandler keeps a tenant's state in sync with what actually happens on
// its connection (paired, phone unlinked it, socket dropped, …).
func (r *registry) eventHandler(ts *tenantSession) func(any) {
	return func(evt any) {
		switch v := evt.(type) {
		case *events.Connected:
			c := ts.getClient()
			phone := ""
			if c != nil && c.Store.ID != nil {
				phone = c.Store.ID.User
			}
			ts.setState(statusConnected, "", phone, "")
			ts.touch()

		case *events.PairSuccess:
			// Fires the moment the phone accepts the QR. Persist the account ->
			// device mapping here so a restart reloads it instead of re-pairing.
			log.Printf("[tenant %s] paired with %s", ts.tenantID, v.ID)
			r.persistMapping(ts, v.ID)
			ts.setState(statusConnected, "", v.ID.User, "")
			ts.touch()

		case *events.Disconnected:
			// Socket dropped. Do NOT report "disconnected" if the device is
			// still linked — that would send an already-paired admin back to
			// the QR screen over a transient network blip or our own idle
			// disconnect. snapshot() derives the right thing from Store.ID.
			c := ts.getClient()
			if c == nil || c.Store.ID == nil {
				ts.setState(statusDisconnected, "", "", "")
			}

		case *events.LoggedOut:
			log.Printf("[tenant %s] device logged out from phone: %v", ts.tenantID, v.Reason)
			safeGo("reset-after-loggedout/"+ts.tenantID, func() {
				r.swapInFreshDevice(ts, "LoggedOut event from phone")
				ts.setState(statusDisconnected, "", "", "unlinked from phone — scan a new QR code to reconnect")
			})
		}
	}
}

func (r *registry) persistMapping(ts *tenantSession, jid types.JID) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := r.mappings.put(ctx, ts.tenantID, jid.String(), jid.User); err != nil {
		// Not fatal for the current process — the in-memory session works —
		// but the link WON'T survive a restart, so make it loud.
		log.Printf("[tenant %s] WARNING: failed to persist session mapping for %s: %v — this link will not survive a restart",
			ts.tenantID, jid, err)
	}
}

// adoptLegacyDevice is a one-time migration for the single-tenant era. Before
// this service was multi-tenant it stored exactly one device with no notion of
// who owned it, so after the upgrade that device is orphaned and its owner
// would be asked to re-scan for no reason.
//
// Set WA_ADOPT_EXISTING_TENANT to the account id that owns the already-linked
// number (for the original single-account install, that's "1") and it gets
// claimed on the next boot. Deliberately opt-in and explicit: guessing which
// account owns a WhatsApp number would be handing one business's number to
// another. It no-ops once any mapping exists, so leaving the variable set is
// harmless.
func (r *registry) adoptLegacyDevice(ctx context.Context, tenantID string) {
	existing, err := r.mappings.all(ctx)
	if err != nil {
		log.Printf("adopt: failed to read existing mappings: %v", err)
		return
	}
	if len(existing) > 0 {
		return // already migrated (or genuinely multi-tenant) — nothing to do
	}

	devices, err := r.container.GetAllDevices(ctx)
	if err != nil {
		log.Printf("adopt: failed to list devices: %v", err)
		return
	}
	if len(devices) != 1 {
		log.Printf("adopt: expected exactly 1 unclaimed device, found %d — skipping (claim it by pairing again)", len(devices))
		return
	}
	device := devices[0]
	if device.ID == nil {
		return
	}

	if err := r.mappings.put(ctx, tenantID, device.ID.String(), device.ID.User); err != nil {
		log.Printf("adopt: failed to assign device %s to account %s: %v", device.ID, tenantID, err)
		return
	}
	log.Printf("adopt: assigned the pre-existing linked number %s to account %s — no re-scan needed",
		device.ID.User, tenantID)
}

// restoreAll rebuilds sessions for every account that had a linked device, so
// the service comes back from a restart ready to send without anyone scanning.
// Sockets are NOT opened here — the first send (or status check) reconnects the
// accounts that are actually in use, which keeps boot fast and memory flat
// whether you have 3 tenants or 300.
func (r *registry) restoreAll(ctx context.Context) {
	mappings, err := r.mappings.all(ctx)
	if err != nil {
		log.Printf("failed to list session mappings on boot: %v", err)
		return
	}
	restored := 0
	for tenantID := range mappings {
		if _, err := r.getOrCreate(ctx, tenantID); err != nil {
			log.Printf("[tenant %s] failed to restore session on boot: %v", tenantID, err)
			continue
		}
		restored++
	}
	log.Printf("restored %d linked WhatsApp session(s) from the store", restored)
}

// ── mappingStore: which account owns which whatsmeow device ──────────────────
// This lives in the Go service's OWN database (the same one whatsmeow uses for
// device credentials), not in the app's MySQL. Keeping it here means the
// service is self-contained: no second DB driver, no cross-database
// transaction, and the account id is just an opaque key handed to us in a
// header. whatsmeow's store can hold many devices but has no notion of who
// owns them — that's the single fact this table adds.
type mappingStore struct {
	db      *sql.DB
	dialect string
}

// ph rewrites `?` placeholders to `$1, $2, …` for postgres. lib/pq doesn't
// accept `?`, and modernc sqlite doesn't accept `$N` reliably, so the SQL below
// is written once with `?` and translated per dialect.
func (m *mappingStore) ph(query string) string {
	if m.dialect != "postgres" {
		return query
	}
	var b strings.Builder
	n := 0
	for _, r := range query {
		if r == '?' {
			n++
			b.WriteString("$")
			b.WriteString(strconv.Itoa(n))
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

func (m *mappingStore) init(ctx context.Context) error {
	_, err := m.db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS wa_tenant_session (
			tenant_id  TEXT PRIMARY KEY,
			device_jid TEXT NOT NULL,
			phone      TEXT NOT NULL DEFAULT '',
			linked_at  TEXT NOT NULL DEFAULT '',
			updated_at TEXT NOT NULL DEFAULT ''
		)
	`)
	return err
}

func (m *mappingStore) get(ctx context.Context, tenantID string) (string, error) {
	var jid string
	err := m.db.QueryRowContext(ctx,
		m.ph(`SELECT device_jid FROM wa_tenant_session WHERE tenant_id = ?`), tenantID,
	).Scan(&jid)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return jid, err
}

func (m *mappingStore) put(ctx context.Context, tenantID, jid, phone string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := m.db.ExecContext(ctx, m.ph(`
		INSERT INTO wa_tenant_session (tenant_id, device_jid, phone, linked_at, updated_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT (tenant_id) DO UPDATE
			SET device_jid = excluded.device_jid,
			    phone      = excluded.phone,
			    updated_at = excluded.updated_at
	`), tenantID, jid, phone, now, now)
	return err
}

func (m *mappingStore) delete(ctx context.Context, tenantID string) error {
	_, err := m.db.ExecContext(ctx,
		m.ph(`DELETE FROM wa_tenant_session WHERE tenant_id = ?`), tenantID)
	return err
}

func (m *mappingStore) all(ctx context.Context) (map[string]string, error) {
	rows, err := m.db.QueryContext(ctx, `SELECT tenant_id, device_jid FROM wa_tenant_session`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make(map[string]string)
	for rows.Next() {
		var tenantID, jid string
		if err := rows.Scan(&tenantID, &jid); err != nil {
			return nil, err
		}
		out[tenantID] = jid
	}
	return out, rows.Err()
}

// ── globals ──────────────────────────────────────────────────────────────────
var reg *registry

// ── safeGo: runs fn in its own goroutine with panic recovery. A panic inside
//
//	a plain `go func(){...}` is NOT caught by recoverMiddleware (that only
//	wraps HTTP handlers) — it crashes the ENTIRE process instead, which is
//	what turns one bad edge case into sustained 502s until Render notices
//	and restarts the service. In a multi-tenant service that's far worse:
//	one tenant's bad state would take down every other tenant's session.
//	Every detached goroutine in this file must go through this. ─────────────
func safeGo(name string, fn func()) {
	go func() {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("recovered from panic in background goroutine %q: %v", name, rec)
			}
		}()
		fn()
	}()
}

// safeGoTenant is safeGo plus the self-healing that only makes sense when we
// know which tenant the goroutine belonged to.
func safeGoTenant(name string, ts *tenantSession, fn func()) {
	go func() {
		defer func() {
			if rec := recover(); rec != nil {
				msg := fmt.Sprintf("%v", rec)
				log.Printf("[tenant %s] recovered from panic in %q: %v", ts.tenantID, name, msg)
				if isDeletedDevice(msg) {
					reg.swapInFreshDevice(ts, "recovered panic in "+name+": "+msg)
					ts.setState(statusDisconnected, "", "", "WhatsApp session was invalidated — scan a new QR code to reconnect")
				} else {
					ts.setState(statusError, "", "", "internal error in "+name+": "+msg)
				}
			}
		}()
		fn()
	}()
}

func isDeletedDevice(msg string) bool {
	return strings.Contains(strings.ToLower(msg), "deleted device")
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
	if internalKey == "change-me-internal-key" {
		log.Println("WARNING: WA_INTERNAL_KEY is using the default placeholder — set it in .env to match your Node backend's value")
	}

	// This is the name the customer sees under WhatsApp → Settings → Linked
	// Devices on their phone. It must be set BEFORE any client is created,
	// because it's baked into the pairing payload. Existing links keep whatever
	// name they were paired under — only newly scanned devices pick this up.
	deviceName := getEnv("WA_DEVICE_NAME", "InventraDecent session")
	store.DeviceProps.Os = proto.String(deviceName)
	log.Printf("linked devices will appear on the phone as %q", deviceName)

	db, dialect, err := openStoreDB()
	if err != nil {
		log.Fatalf("failed to open session store: %v", err)
	}

	ctx := context.Background()
	container := sqlstore.NewWithDB(db, dialect, waLog.Stdout("DB", "ERROR", true))
	// NewWithDB (unlike sqlstore.New) does not run migrations for us.
	if err := container.Upgrade(ctx); err != nil {
		log.Fatalf("failed to upgrade whatsmeow schema: %v", err)
	}

	mappings := &mappingStore{db: db, dialect: dialect}
	if err := mappings.init(ctx); err != nil {
		log.Fatalf("failed to create wa_tenant_session table: %v", err)
	}

	reg = newRegistry(container, mappings)
	if adopt := strings.TrimSpace(os.Getenv("WA_ADOPT_EXISTING_TENANT")); adopt != "" {
		if !validTenantID(adopt) {
			log.Printf("ignoring invalid WA_ADOPT_EXISTING_TENANT=%q", adopt)
		} else {
			reg.adoptLegacyDevice(ctx, adopt)
		}
	}
	reg.restoreAll(ctx)

	if idle := idleTimeout(); idle > 0 {
		log.Printf("idle sessions will drop their socket after %s (they stay linked)", idle)
		startIdleReaper(idle)
	} else {
		log.Println("idle disconnect is DISABLED — every linked session holds a live socket")
	}

	mux := http.NewServeMux()
	// /healthz is deliberately unauthenticated and tenant-free: it's what the
	// Node backend probes to tell "the WhatsApp service is down" apart from
	// "this account isn't linked yet", so it must answer even when nothing is
	// configured.
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]any{"ok": true, "sessions": len(reg.list())})
	})
	mux.HandleFunc("/session/status", withTenant(internalKey, handleStatus))
	mux.HandleFunc("/session/start", withTenant(internalKey, handleStart))
	mux.HandleFunc("/session/logout", withTenant(internalKey, handleLogout))
	mux.HandleFunc("/messages/send-text", withTenant(internalKey, handleSendText))
	mux.HandleFunc("/messages/send-media", withTenant(internalKey, handleSendMedia))

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Printf("whatsmeow-service listening on :%s (multi-tenant, one number per account)", port)
	log.Fatal(srv.ListenAndServe())
}

// openStoreDB opens the database that holds BOTH whatsmeow's device
// credentials and our account -> device mapping.
func openStoreDB() (*sql.DB, string, error) {
	// WA_DB_DRIVER selects the session store backend:
	//   "sqlite"   (default) — a local file. Fine for a single tenant or local
	//                          dev. On Render's FREE tier there is no
	//                          persistent disk, so the file is wiped on every
	//                          restart/redeploy — every tenant would have to
	//                          re-scan constantly.
	//   "postgres" — points at any Postgres database. This is what actually
	//                persists linked devices across restarts, and it handles
	//                many tenants writing concurrently far better than one
	//                SQLite file. Use this in production.
	dbDriver := getEnv("WA_DB_DRIVER", "sqlite")
	var dsn string

	if dbDriver == "postgres" {
		dsn = getEnv("WA_DB_DSN", "")
		if dsn == "" {
			return nil, "", errors.New("WA_DB_DSN is required when WA_DB_DRIVER=postgres (e.g. postgres://user:pass@host/dbname?sslmode=require)")
		}
		if err := checkNotPooled(dsn); err != nil {
			return nil, "", err
		}
		// whatsmeow asks the application to supply this (see the doc comment on
		// sqlstore.PostgresArrayWrapper). Without it, GetManySessions falls back
		// to building a fresh `IN ($2,$3,…)` query per address count instead of
		// one stable `= ANY($2)` — more distinct prepared statements for no
		// reason. Sending a message prefetches sessions through that path, so
		// this is on the hot path for every single send.
		sqlstore.PostgresArrayWrapper = pq.Array
	} else {
		dbDriver = "sqlite"
		dbPath := getEnv("WA_DB_PATH", "./wa_session.db")
		// busy_timeout + WAL matter much more now than they did with a single
		// session: several tenants pairing or reconnecting at once means
		// concurrent writers, and without these SQLite returns "database is
		// locked" instead of waiting its turn.
		dsn = fmt.Sprintf("file:%s?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)", dbPath)
		log.Println("WARNING: using SQLite for the session store — set WA_DB_DRIVER=postgres for multi-tenant production use")
	}

	db, err := sql.Open(dbDriver, dsn)
	if err != nil {
		return nil, "", fmt.Errorf("failed to open %s database: %w", dbDriver, err)
	}
	if dbDriver == "sqlite" {
		// One writer at a time; the pool would otherwise create parallel
		// connections that just fight each other over the file lock.
		db.SetMaxOpenConns(1)
	} else {
		// Keep the pool small and recycle it. Serverless Postgres (Neon,
		// Supabase) caps connections per branch and closes idle ones on its own
		// side; a long-lived Go pool that never recycles ends up handing out
		// sockets the server already dropped.
		db.SetMaxOpenConns(10)
		db.SetMaxIdleConns(2)
		db.SetConnMaxLifetime(5 * time.Minute)
		db.SetConnMaxIdleTime(time.Minute)
	}
	if err := db.Ping(); err != nil {
		return nil, "", fmt.Errorf("failed to reach %s database: %w", dbDriver, err)
	}
	return db, dbDriver, nil
}

// checkNotPooled refuses to start against a PgBouncer-style transaction pooler.
//
// This is not a style preference — it is a hard incompatibility that produces
// errors like:
//
//	failed to prefetch sessions: pq: bind message supplies 4 parameters,
//	but prepared statement "" requires 3 (08P01)
//
// lib/pq always uses Postgres' extended query protocol (Parse then Bind) for
// any parameterised query. A transaction-mode pooler multiplexes clients over
// shared backend connections, so the Bind can land on a different backend than
// the Parse did — where the unnamed prepared statement is some *other* query.
// Hence a parameter count that has nothing to do with the query we sent. It
// fails intermittently, depending on pooler traffic, which makes it miserable
// to diagnose from a "message send failed" in the UI.
//
// Neon's dashboard hands you the "-pooler" host by default, so this is very
// easy to walk into. This service is a long-lived process with a 10-connection
// pool: it does not need an external pooler at all. Use the direct host (the
// same hostname without "-pooler").
//
// Escape hatch: set WA_ALLOW_POOLED_DSN=1 if you know your pooler runs in
// session mode (where prepared statements are safe).
func checkNotPooled(dsn string) error {
	if !strings.Contains(dsn, "-pooler.") {
		return nil
	}
	if getEnv("WA_ALLOW_POOLED_DSN", "") != "" {
		log.Println("WARNING: WA_DB_DSN points at a connection pooler and WA_ALLOW_POOLED_DSN is set — " +
			"if this pooler is in transaction mode, sends will fail intermittently with 08P01 errors")
		return nil
	}
	return errors.New("WA_DB_DSN points at a connection pooler (host contains \"-pooler\"), which breaks " +
		"prepared statements and makes message sending fail with \"bind message supplies N parameters\" (08P01). " +
		"Use the direct host instead — the same URL with \"-pooler\" removed. " +
		"Set WA_ALLOW_POOLED_DSN=1 only if your pooler is in session mode")
}

func idleTimeout() time.Duration {
	mins, err := strconv.Atoi(getEnv("WA_IDLE_TIMEOUT", "15"))
	if err != nil || mins < 0 {
		log.Printf("invalid WA_IDLE_TIMEOUT %q — using 15 minutes", os.Getenv("WA_IDLE_TIMEOUT"))
		mins = 15
	}
	return time.Duration(mins) * time.Minute
}

func startIdleReaper(idle time.Duration) {
	safeGo("idle-reaper", func() {
		for range time.Tick(time.Minute) {
			for _, ts := range reg.list() {
				ts.disconnectIfIdle(idle)
			}
			reg.pruneIdleUnlinked(idle)
		}
	})
}

// ── middleware ───────────────────────────────────────────────────────────────
type tenantHandler func(http.ResponseWriter, *http.Request, *tenantSession)

// withTenant chains the three things every real endpoint needs: panic
// recovery, the shared-secret check, and resolving X-Tenant-Id into a session.
func withTenant(internalKey string, next tenantHandler) http.HandlerFunc {
	return recoverMiddleware(requireKey(internalKey, requireTenant(next)))
}

// recoverMiddleware turns a whatsmeow panic into a normal JSON 500. Without
// this, a panic tears down the TCP connection for that request, which looks to
// the frontend like "the request failed weirdly" and often gets retried
// immediately — turning one bad state into a flood of failures.
func recoverMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("recovered from panic in %s: %v", r.URL.Path, rec)
				writeJSON(w, 500, map[string]string{"error": fmt.Sprintf("internal error: %v", rec)})
			}
		}()
		next(w, r)
	}
}

// requireKey is a simple shared-secret header check, since this service only
// needs to trust your Node backend, not the public internet.
func requireKey(key string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Internal-Key") != key {
			writeJSON(w, 401, map[string]string{"error": "unauthorized"})
			return
		}
		next(w, r)
	}
}

// requireTenant resolves X-Tenant-Id — the account id — into that account's
// session. The Node backend sets this header from the verified JWT (req.user.aid);
// it is NEVER taken from a request body or query string, for the same reason
// loadContext.js refuses to trust a client-supplied org_id: a client could set
// it to any value and hijack another account's WhatsApp number.
func requireTenant(next tenantHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tenantID := strings.TrimSpace(r.Header.Get("X-Tenant-Id"))
		if tenantID == "" {
			writeJSON(w, 400, map[string]string{"error": "X-Tenant-Id header is required"})
			return
		}
		if !validTenantID(tenantID) {
			writeJSON(w, 400, map[string]string{"error": "invalid X-Tenant-Id"})
			return
		}

		ts, err := reg.getOrCreate(r.Context(), tenantID)
		if err != nil {
			log.Printf("[tenant %s] failed to resolve session: %v", tenantID, err)
			writeJSON(w, 500, map[string]string{"error": "failed to load this account's WhatsApp session"})
			return
		}
		next(w, r, ts)
	}
}

// validTenantID keeps the value to a safe, log-friendly shape. Account ids are
// numeric today; alphanumerics/dash/underscore leaves room for UUIDs later
// without allowing anything that could confuse a log line or a file path.
func validTenantID(id string) bool {
	if len(id) == 0 || len(id) > 64 {
		return false
	}
	for _, r := range id {
		switch {
		case r >= '0' && r <= '9',
			r >= 'a' && r <= 'z',
			r >= 'A' && r <= 'Z',
			r == '-', r == '_':
		default:
			return false
		}
	}
	return true
}

// ── GET /session/status ──────────────────────────────────────────────────────
func handleStatus(w http.ResponseWriter, r *http.Request, ts *tenantSession) {
	// Counts as activity so the reaper doesn't prune a session out from under
	// someone who currently has the QR popup open and polling.
	ts.touch()
	writeJSON(w, 200, ts.snapshot())
}

// ── POST /session/start ──────────────────────────────────────────────────────
func handleStart(w http.ResponseWriter, r *http.Request, ts *tenantSession) {
	c := ts.getClient()

	// Already linked: reconnect if needed, never show a QR. This is the
	// "same account logs in again → don't ask to scan" case.
	if c != nil && c.Store.ID != nil {
		if c.IsConnected() && c.IsLoggedIn() {
			ts.touch()
			writeJSON(w, 200, ts.snapshot())
			return
		}
		safeGoTenant("reconnect-existing-device", ts, func() {
			if err := ts.ensureConnected(); err != nil {
				log.Printf("[tenant %s] reconnect failed: %v", ts.tenantID, err)
			}
		})
		writeJSON(w, 200, ts.snapshot())
		return
	}

	// A pairing attempt is already running — hand back the current QR instead
	// of opening a second QR channel. Two channels on one client fight over
	// the same socket and produce QR codes that are already invalid by the
	// time they render, which looks to the user like "the QR never works".
	ts.mu.Lock()
	if ts.pairing {
		ts.mu.Unlock()
		writeJSON(w, 200, ts.snapshot())
		return
	}
	ts.pairing = true
	pairCtx, cancel := context.WithCancel(context.Background())
	ts.pairCancel = cancel
	ts.status = statusConnecting
	ts.qr = ""
	ts.errMsg = ""
	ts.mu.Unlock()

	qrChan, err := c.GetQRChannel(pairCtx)
	if err != nil {
		ts.cancelPairing()
		ts.setState(statusError, "", "", err.Error())
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}

	safeGoTenant("qr-pairing-connect", ts, func() {
		if err := c.Connect(); err != nil && !errors.Is(err, whatsmeow.ErrAlreadyConnected) {
			ts.cancelPairing()
			ts.setState(statusError, "", "", err.Error())
		}
	})

	safeGoTenant("qr-channel-reader", ts, func() {
		defer ts.cancelPairing()
		for evt := range qrChan {
			switch evt.Event {
			case "code":
				png, err := qrcode.Encode(evt.Code, qrcode.Medium, 320)
				if err != nil {
					ts.setState(statusError, "", "", "failed to render QR: "+err.Error())
					continue
				}
				ts.setState(statusQR, base64.StdEncoding.EncodeToString(png), "", "")
			case "success":
				// PairSuccess (see eventHandler) is what persists the mapping;
				// this just clears the QR out of the state.
				phone := ""
				if cc := ts.getClient(); cc != nil && cc.Store.ID != nil {
					phone = cc.Store.ID.User
				}
				ts.setState(statusConnected, "", phone, "")
				ts.touch()
			case "timeout":
				ts.setState(statusDisconnected, "", "", "QR code expired, please try again")
			default:
				ts.setState(statusError, "", "", "pairing failed: "+evt.Event)
			}
		}
	})

	writeJSON(w, 200, ts.snapshot())
}

// ── POST /session/logout ─────────────────────────────────────────────────────
func handleLogout(w http.ResponseWriter, r *http.Request, ts *tenantSession) {
	if c := ts.getClient(); c != nil && c.Store.ID != nil {
		if err := c.Logout(r.Context()); err != nil {
			log.Printf("[tenant %s] logout error: %v", ts.tenantID, err)
		}
	}
	// swapInFreshDevice also clears this account's mapping row, so the next
	// /session/start correctly offers a new QR.
	reg.swapInFreshDevice(ts, "manual logout")
	writeJSON(w, 200, ts.snapshot())
}

// ── POST /messages/send-text  { phone, message } ─────────────────────────────
func handleSendText(w http.ResponseWriter, r *http.Request, ts *tenantSession) {
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

	c, ok := readyClient(w, ts)
	if !ok {
		return
	}

	if _, err := c.SendMessage(r.Context(), buildJID(body.Phone), &waE2E.Message{
		Conversation: proto.String(body.Message),
	}); err != nil {
		writeJSON(w, 502, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]bool{"success": true})
}

// ── POST /messages/send-media  (multipart: file, phone, caption) ─────────────
func handleSendMedia(w http.ResponseWriter, r *http.Request, ts *tenantSession) {
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

	c, ok := readyClient(w, ts)
	if !ok {
		return
	}

	jid := buildJID(phone)
	ctx := r.Context()

	// The caption goes as its own text message, sent first, so that an edited
	// message is guaranteed to be delivered as real message text rather than
	// depending on whether WhatsApp renders a document caption. Two messages
	// arriving back-to-back reads fine in WhatsApp.
	//
	// Because that's two sends, partial success is possible. Say which half
	// made it rather than a bare "send failed" — the user needs to know whether
	// resending would duplicate the message.
	captionSent := false
	if caption != "" {
		if _, err := c.SendMessage(ctx, jid, &waE2E.Message{
			Conversation: proto.String(caption),
		}); err != nil {
			writeJSON(w, 502, map[string]string{"error": "message send failed, nothing was delivered: " + err.Error()})
			return
		}
		captionSent = true
	}

	// failMedia reports an attachment failure, noting whether the text message
	// already went out.
	failMedia := func(stage string, err error) {
		msg := stage + ": " + err.Error()
		if captionSent {
			msg = "the message was delivered but the attachment failed — " + msg
		}
		writeJSON(w, 502, map[string]string{"error": msg})
	}

	ext := strings.ToLower(filepath.Ext(header.Filename))
	mimeType := mime.TypeByExtension(ext)
	if mimeType == "" {
		// The user can now attach anything from the preview popup, not just a
		// generated PDF, so fall back to what the browser told us before
		// giving up and calling it a generic blob.
		mimeType = header.Header.Get("Content-Type")
	}
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	if isImageExt(ext) {
		resp, err := c.Upload(ctx, data, whatsmeow.MediaImage)
		if err != nil {
			failMedia("image upload failed", err)
			return
		}
		if _, err = c.SendMessage(ctx, jid, &waE2E.Message{
			ImageMessage: &waE2E.ImageMessage{
				Mimetype:      proto.String(mimeType),
				URL:           proto.String(resp.URL),
				DirectPath:    proto.String(resp.DirectPath),
				MediaKey:      resp.MediaKey,
				FileEncSHA256: resp.FileEncSHA256,
				FileSHA256:    resp.FileSHA256,
				FileLength:    proto.Uint64(resp.FileLength),
			},
		}); err != nil {
			failMedia("attachment send failed", err)
			return
		}
	} else {
		resp, err := c.Upload(ctx, data, whatsmeow.MediaDocument)
		if err != nil {
			failMedia("document upload failed", err)
			return
		}
		if _, err = c.SendMessage(ctx, jid, &waE2E.Message{
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
		}); err != nil {
			failMedia("attachment send failed", err)
			return
		}
	}

	writeJSON(w, 200, map[string]bool{"success": true})
}

// readyClient resolves the tenant's client and guarantees it's connected and
// logged in, writing the right error response if it can't. The two failure
// modes are deliberately different status codes so the frontend can tell
// "scan a QR" (409) apart from "WhatsApp is unhappy right now" (503).
func readyClient(w http.ResponseWriter, ts *tenantSession) (*whatsmeow.Client, bool) {
	if err := ts.ensureConnected(); err != nil {
		if errors.Is(err, errNotLinked) {
			writeJSON(w, 409, map[string]string{"error": "This account has no WhatsApp number linked yet. An admin needs to scan the QR code once."})
			return nil, false
		}
		writeJSON(w, 503, map[string]string{"error": err.Error()})
		return nil, false
	}
	return ts.getClient(), true
}

// ── helpers ──────────────────────────────────────────────────────────────────
func isImageExt(ext string) bool {
	switch ext {
	case ".jpg", ".jpeg", ".png", ".webp":
		return true
	default:
		return false
	}
}

func buildJID(phone string) types.JID {
	return types.NewJID(onlyDigits(phone), types.DefaultUserServer)
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

func writeJSON(w http.ResponseWriter, status int, v any) {
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
