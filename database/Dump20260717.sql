-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: gateway01.ap-southeast-1.prod.aws.tidbcloud.com    Database: inventradecent
-- ------------------------------------------------------
-- Server version	8.0.11-TiDB-v8.5.3-serverless

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `audit_log`
--

DROP TABLE IF EXISTS `audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `action` varchar(50) DEFAULT NULL,
  `module` varchar(50) DEFAULT NULL,
  `record_id` int DEFAULT NULL,
  `details` json DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `audit_log`
--

LOCK TABLES `audit_log` WRITE;
/*!40000 ALTER TABLE `audit_log` DISABLE KEYS */;
/*!40000 ALTER TABLE `audit_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cashcustdetail`
--

DROP TABLE IF EXISTS `cashcustdetail`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cashcustdetail` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `transaction_id` int DEFAULT NULL,
  `CustName` varchar(100) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `MobileNo` varchar(10) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  PRIMARY KEY (`Id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci AUTO_INCREMENT=60001;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cashcustdetail`
--

LOCK TABLES `cashcustdetail` WRITE;
/*!40000 ALTER TABLE `cashcustdetail` DISABLE KEYS */;
INSERT INTO `cashcustdetail` VALUES (1,3,'rakesh bhai',NULL),(30001,30004,'rakesh',NULL);
/*!40000 ALTER TABLE `cashcustdetail` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `category`
--

DROP TABLE IF EXISTS `category`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `category` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(45) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci AUTO_INCREMENT=60001;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `category`
--

LOCK TABLES `category` WRITE;
/*!40000 ALTER TABLE `category` DISABLE KEYS */;
INSERT INTO `category` VALUES (1,'raymond'),(30001,'trovine'),(30002,'matty');
/*!40000 ALTER TABLE `category` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `company`
--

DROP TABLE IF EXISTS `company`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `company` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) DEFAULT NULL,
  `tagline` varchar(150) DEFAULT NULL,
  `address` varchar(150) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `web` varchar(100) DEFAULT NULL,
  `pan` varchar(15) DEFAULT NULL,
  `gstin` varchar(15) DEFAULT NULL,
  `logo_url` varchar(255) DEFAULT NULL,
  `bank_name` varchar(100) DEFAULT NULL,
  `bank_branch` varchar(100) DEFAULT NULL,
  `bank_acc_number` varchar(30) DEFAULT NULL,
  `bank_ifsc` varchar(15) DEFAULT NULL,
  `upi_id` varchar(100) DEFAULT NULL,
  `account_holder` varchar(100) DEFAULT NULL,
  `terms` json DEFAULT NULL,
  `financial_year_start` date DEFAULT NULL,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin AUTO_INCREMENT=30001;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `company`
--

LOCK TABLES `company` WRITE;
/*!40000 ALTER TABLE `company` DISABLE KEYS */;
INSERT INTO `company` VALUES (1,'Decent Fabric Shop','Rajkot\'s Finest Selection of Fabrics','','Rajkot, Gujarat','','',NULL,NULL,NULL,'/uploads/company/logo_1783794922230.png','bank 1','branch',NULL,NULL,'9376614893@hdfc','','[\"Subject to Rajkot Jurisdiction.\", \"Our Responsibility Ceases as soon as goods leaves our Premises\", \"Goods once sold will not taken back.\", \"Delivery Ex-Premises.\"]',NULL,'2026-07-12 16:17:53');
/*!40000 ALTER TABLE `company` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `customer`
--

DROP TABLE IF EXISTS `customer`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `contact_no` varchar(10) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `city` varchar(50) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `gstin` varchar(15) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `group` int DEFAULT NULL,
  `address` varchar(100) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `opening` decimal(10,2) DEFAULT '0.00',
  `credit` decimal(10,2) DEFAULT '0.00',
  `debit` decimal(10,2) DEFAULT '0.00',
  `closing` decimal(10,2) DEFAULT '0.00',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci AUTO_INCREMENT=60001;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customer`
--

LOCK TABLES `customer` WRITE;
/*!40000 ALTER TABLE `customer` DISABLE KEYS */;
INSERT INTO `customer` VALUES (1,'baki customer',NULL,'Rajkot','24AAA3MZZWZ9',1,'Rajkot',0.00,2000.00,2100.00,100.00),(30002,'d d corporation','4578945455','ahmedabad',NULL,2,'ahmedabad',0.00,1575.00,500.00,-1075.00),(30003,'r p j hotel','6353397539','rajkot',NULL,1,'rajkot',0.00,0.00,3150.00,3150.00),(30004,'RAKESH','654646465',NULL,NULL,1,'N/A',0.00,0.00,200.00,200.00);
/*!40000 ALTER TABLE `customer` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `group`
--

DROP TABLE IF EXISTS `group`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `group` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(45) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci AUTO_INCREMENT=30018;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `group`
--

LOCK TABLES `group` WRITE;
/*!40000 ALTER TABLE `group` DISABLE KEYS */;
INSERT INTO `group` VALUES (1,'customer'),(2,'supplier');
/*!40000 ALTER TABLE `group` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `product`
--

DROP TABLE IF EXISTS `product`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `product` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `category` varchar(45) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `purc_rate` decimal(8,2) DEFAULT NULL,
  `sale_rate` decimal(8,2) DEFAULT NULL,
  `hsn_code` varchar(45) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `barcode` varchar(12) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `gstPer` int DEFAULT '0',
  `o_qty` decimal(8,2) DEFAULT '0',
  `p_qty` decimal(8,2) DEFAULT '0',
  `s_qty` decimal(8,2) DEFAULT '0',
  `c_qty` decimal(8,2) DEFAULT '0',
  `lowstockqty` decimal(8,2) DEFAULT '0',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci AUTO_INCREMENT=60001;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product`
--

LOCK TABLES `product` WRITE;
/*!40000 ALTER TABLE `product` DISABLE KEYS */;
INSERT INTO `product` VALUES (1,'kapad 1','1',100.00,200.00,NULL,'PRD710109719',5,0.00,0.00,11.00,-11.00,10.00),(30001,'rayomand','30001',100.00,200.00,'1564','PRD660837143',5,0.00,15.00,1.00,14.00,1.30),(30002,'h o d shirt','30002',400.00,600.00,NULL,'PRD087333760',5,0.00,0.00,5.00,-5.00,0.00);
/*!40000 ALTER TABLE `product` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `transaction`
--

DROP TABLE IF EXISTS `transaction`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transaction` (
  `id` int NOT NULL AUTO_INCREMENT,
  `trans_type` char(2) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `cash_debit` char(1) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `payment_mode` varchar(10) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT 'Cash | Bank (CP/CR only)',
  `ref_no` varchar(50) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT 'Cheque No / UTR / Txn Ref',
  `narration` varchar(255) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT 'Free text note (CP/CR)',
  `date` datetime DEFAULT NULL,
  `bill_no` varchar(45) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `isgstbill` tinyint DEFAULT NULL,
  `customer_id` int DEFAULT NULL,
  `taxable_amount` decimal(10,2) DEFAULT NULL,
  `ROUNDOFF` decimal(4,2) DEFAULT NULL,
  `discount` decimal(8,2) DEFAULT NULL,
  `final_amount` decimal(10,2) DEFAULT NULL,
  `userid` int DEFAULT NULL,
  `creation_date` datetime DEFAULT NULL,
  `updation_date` datetime DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_txn_customer_type_cd` (`customer_id`,`trans_type`,`cash_debit`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci AUTO_INCREMENT=60001;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transaction`
--

LOCK TABLES `transaction` WRITE;
/*!40000 ALTER TABLE `transaction` DISABLE KEYS */;
INSERT INTO `transaction` VALUES (1,'SI','D',NULL,NULL,NULL,'2026-07-12 00:00:00','BILL-0001',1,1,2000.00,0.00,0.00,2100.00,1,'2026-07-12 15:56:33','2026-07-12 16:10:48'),(2,'CR','D','Cash','','','2026-07-12 00:00:00','rec',NULL,1,0.00,0.00,0.00,2000.00,1,'2026-07-12 15:57:26','2026-07-12 15:57:26'),(3,'SI','C',NULL,NULL,NULL,'2026-07-12 00:00:00','BILL-0002',0,0,1.00,0.00,0.00,1.00,1,'2026-07-12 16:19:01','2026-07-12 16:19:01'),(30001,'PI','D',NULL,NULL,NULL,'2026-07-01 00:00:00','45',1,30002,1500.00,0.00,0.00,1575.00,1,'2026-07-12 16:46:25','2026-07-12 16:46:25'),(30002,'CP','D','Bank','rtgs','dt/ 7/jjj7kkk','2026-07-09 00:00:00','45',NULL,30002,0.00,0.00,0.00,500.00,1,'2026-07-12 16:47:59','2026-07-12 16:47:59'),(30003,'SI','D',NULL,NULL,NULL,'2026-07-12 00:00:00','BILL-0003',1,30003,3000.00,0.00,0.00,3150.00,1,'2026-07-12 16:52:47','2026-07-12 16:52:47'),(30004,'SI','D',NULL,NULL,NULL,'2026-07-12 00:00:00','BILL-0004',0,30004,200.00,0.00,0.00,200.00,1,'2026-07-12 16:58:24','2026-07-12 16:59:46');
/*!40000 ALTER TABLE `transaction` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `transaction_adjustments`
--

DROP TABLE IF EXISTS `transaction_adjustments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transaction_adjustments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `voucher_transaction_id` int NOT NULL COMMENT 'transaction.id of the CP/CR voucher',
  `bill_transaction_id` int NOT NULL COMMENT 'transaction.id of the SI/PI bill being settled',
  `adjusted_amount` decimal(14,2) NOT NULL DEFAULT '0',
  `creation_date` datetime NOT NULL,
  `updation_date` datetime NOT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin AUTO_INCREMENT=60001;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transaction_adjustments`
--

LOCK TABLES `transaction_adjustments` WRITE;
/*!40000 ALTER TABLE `transaction_adjustments` DISABLE KEYS */;
INSERT INTO `transaction_adjustments` VALUES (1,2,1,2000.00,'2026-07-12 15:57:26','2026-07-12 15:57:26'),(30001,30002,30001,500.00,'2026-07-12 16:47:59','2026-07-12 16:47:59');
/*!40000 ALTER TABLE `transaction_adjustments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `transaction_items`
--

DROP TABLE IF EXISTS `transaction_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transaction_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `transaction_id` int NOT NULL,
  `product_id` int DEFAULT NULL,
  `qty` decimal(8,2) DEFAULT NULL,
  `rate` decimal(8,2) DEFAULT NULL,
  `taxable_amount` decimal(8,2) DEFAULT NULL,
  `CGST` decimal(8,2) DEFAULT NULL,
  `SGST` decimal(8,2) DEFAULT NULL,
  `creation_date` datetime DEFAULT NULL,
  `updation_date` datetime DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci AUTO_INCREMENT=60001;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transaction_items`
--

LOCK TABLES `transaction_items` WRITE;
/*!40000 ALTER TABLE `transaction_items` DISABLE KEYS */;
INSERT INTO `transaction_items` VALUES (3,1,1,10.00,200.00,2000.00,50.00,50.00,'2026-07-12 16:10:48','2026-07-12 16:10:48'),(4,3,1,1.00,1.00,1.00,0.00,0.00,'2026-07-12 16:19:02','2026-07-12 16:19:02'),(30001,30001,30001,15.00,100.00,1500.00,37.50,37.50,'2026-07-12 16:46:25','2026-07-12 16:46:25'),(30002,30003,30002,5.00,600.00,3000.00,75.00,75.00,'2026-07-12 16:52:47','2026-07-12 16:52:47'),(30004,30004,30001,1.00,200.00,200.00,0.00,0.00,'2026-07-12 16:59:46','2026-07-12 16:59:46');
/*!40000 ALTER TABLE `transaction_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user`
--

DROP TABLE IF EXISTS `user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` varchar(50) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `password` varchar(100) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `name` varchar(45) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `userrole` int DEFAULT NULL,
  `rights` json DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `last_login` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `reset_token` varchar(64) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `reset_token_expiry` datetime DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci AUTO_INCREMENT=30003;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user`
--

LOCK TABLES `user` WRITE;
/*!40000 ALTER TABLE `user` DISABLE KEYS */;
INSERT INTO `user` VALUES (1,'admin','$2a$10$A/cqUnSFdmo0ctCruGa.pecWzrPG5j4wqZmaKUSm1.tG21s5DImjO','Mansi Degda',1,NULL,1,'2026-07-17 15:36:38','2026-07-08 18:53:18',NULL,NULL);
/*!40000 ALTER TABLE `user` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `userrole`
--

DROP TABLE IF EXISTS `userrole`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `userrole` (
  `id` int NOT NULL AUTO_INCREMENT,
  `role` varchar(45) COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `rights` json DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci AUTO_INCREMENT=30003;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `userrole`
--

LOCK TABLES `userrole` WRITE;
/*!40000 ALTER TABLE `userrole` DISABLE KEYS */;
INSERT INTO `userrole` VALUES (1,'admin','[\"*\"]'),(2,'guest',NULL);
/*!40000 ALTER TABLE `userrole` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping events for database 'inventradecent'
--

--
-- Dumping routines for database 'inventradecent'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-17 21:56:16
