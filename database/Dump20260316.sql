-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: localhost    Database: inventradecent
-- ------------------------------------------------------
-- Server version	8.0.43

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
-- Table structure for table `category`
--

DROP TABLE IF EXISTS `category`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `category` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `category`
--

LOCK TABLES `category` WRITE;
/*!40000 ALTER TABLE `category` DISABLE KEYS */;
INSERT INTO `category` VALUES (1,'c1'),(2,'c2'),(3,'c3'),(5,'cat1');
/*!40000 ALTER TABLE `category` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `customer`
--

DROP TABLE IF EXISTS `customer`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `contact_no` varchar(10) DEFAULT NULL,
  `city` varchar(50) DEFAULT NULL,
  `gstin` varchar(15) DEFAULT NULL,
  `group` int DEFAULT NULL,
  `address` varchar(100) DEFAULT NULL,
  `opening` decimal(10,2) DEFAULT NULL,
  `credit` decimal(10,2) DEFAULT NULL,
  `debit` decimal(10,2) DEFAULT NULL,
  `closing` decimal(10,2) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=56 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customer`
--

LOCK TABLES `customer` WRITE;
/*!40000 ALTER TABLE `customer` DISABLE KEYS */;
INSERT INTO `customer` VALUES (9,'vbb',NULL,NULL,NULL,1,'N/A',0.00,0.00,0.00,0.00),(13,'ttttt',NULL,NULL,NULL,1,'N/A',0.00,0.00,0.00,0.00),(15,'tttt',NULL,NULL,NULL,1,'N/A',0.00,0.00,0.00,0.00),(18,'ffff','6353397539','Rajkot',NULL,1,'Rajkot',0.00,0.00,0.00,0.00),(23,'ffffff',NULL,NULL,NULL,1,'N/A',0.00,0.00,0.00,0.00),(26,'cccccc',NULL,NULL,NULL,1,'N/A',0.00,0.00,0.00,0.00),(28,'Mansi Degda','6353397539','Rajkot',NULL,1,'Rajkot',0.00,0.00,0.00,0.00),(29,'Mansi Degda','6353397539','Rajkot',NULL,1,'Rajkot',0.00,0.00,0.00,0.00),(30,'A   mansi','6353397539','Rajkot','24AAR1zBB',1,'Rajkot',0.00,0.00,0.00,0.00),(32,'mansu',NULL,NULL,NULL,1,'N/A',0.00,0.00,0.00,0.00),(33,'sss',NULL,NULL,NULL,1,'N/A',0.00,0.00,0.00,0.00),(34,'sssssss',NULL,NULL,NULL,1,'N/A',0.00,0.00,0.00,0.00),(35,'testttt',NULL,NULL,NULL,1,'N/A',0.00,0.00,0.00,0.00),(37,'testttttttttttttttttttttttttttt',NULL,NULL,NULL,1,'N/A',0.00,0.00,0.00,0.00),(38,'zzz22222222222222222222222222222222',NULL,NULL,NULL,1,'N/A',0.00,0.00,0.00,0.00),(39,'333333333333333333',NULL,NULL,NULL,1,'N/A',0.00,0.00,0.00,0.00),(40,'eeeeeeeeeeeeeeeeeee',NULL,NULL,NULL,1,'N/A',0.00,0.00,0.00,0.00),(43,'....',NULL,NULL,NULL,1,'N/A',0.00,0.00,0.00,0.00),(45,'44',NULL,NULL,NULL,1,'N/A',0.00,0.00,0.00,0.00),(46,'kk',NULL,NULL,NULL,1,'N/A',0.00,0.00,0.00,0.00),(47,'type1',NULL,NULL,NULL,1,'N/A',0.00,0.00,0.00,0.00),(48,'tttt','666','rajkot',NULL,1,'rajkot',0.00,0.00,0.00,0.00),(49,'raj','6353397539','rajkot',NULL,1,'rajkot',0.00,0.00,0.00,0.00),(50,'test','6788','city1',NULL,4,'city1',0.00,0.00,0.00,0.00),(51,'tesdt','1234567890','city1',NULL,1,'city1',0.00,0.00,0.00,0.00),(52,'345',NULL,'tt',NULL,5,'tt',0.00,0.00,0.00,0.00),(53,'hiteshbhai',NULL,'rajkot',NULL,1,'rajkot',0.00,0.00,0.00,0.00),(54,'hieshbhai','123333','amd','24A',2,'amd',100.00,0.00,0.00,100.00),(55,'acc01',NULL,NULL,NULL,16,'N/A',10.00,0.00,0.00,10.00);
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
  `name` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `group`
--

LOCK TABLES `group` WRITE;
/*!40000 ALTER TABLE `group` DISABLE KEYS */;
INSERT INTO `group` VALUES (2,'supplier'),(3,'heh'),(6,'test'),(8,'dp '),(9,'gp'),(11,'bd'),(14,'dd'),(15,'customer'),(16,'test'),(17,'g12');
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
  `name` varchar(100) DEFAULT NULL,
  `category` varchar(45) DEFAULT NULL,
  `purc_rate` decimal(8,2) DEFAULT NULL,
  `sale_rate` decimal(8,2) DEFAULT NULL,
  `hsn_code` varchar(45) DEFAULT NULL,
  `barcode` varchar(6) DEFAULT NULL,
  `gstPer` int DEFAULT '0',
  `o_qty` decimal(8,2) DEFAULT NULL,
  `p_qty` decimal(8,2) DEFAULT NULL,
  `s_qty` decimal(8,2) DEFAULT NULL,
  `c_qty` decimal(8,2) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product`
--

LOCK TABLES `product` WRITE;
/*!40000 ALTER TABLE `product` DISABLE KEYS */;
INSERT INTO `product` VALUES (2,'peo01',NULL,200.00,10.00,'dd','dd',0,1.00,0.00,0.00,0.00),(5,'ddd','1',120.00,101.00,NULL,'sss',5,0.00,0.00,0.00,0.00),(6,'test','1',12.00,10.00,NULL,'b1',18,0.00,0.00,0.00,0.00),(7,'pro01','3',12.00,10.00,NULL,'10',28,10.00,0.00,0.00,10.00),(8,'pro01','2',10.00,10.00,NULL,'test',0,0.00,0.00,0.00,0.00),(9,'ffcf','2',13.00,10.00,NULL,'fff',0,0.00,0.00,0.00,0.00);
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
  `trans_type` char(2) DEFAULT NULL,
  `credit_debit` char(1) DEFAULT NULL,
  `date` datetime DEFAULT NULL,
  `bill_no` varchar(45) DEFAULT NULL,
  `customer_id` int DEFAULT NULL,
  `taxable_amount` decimal(10,2) DEFAULT NULL,
  `ROUNDOFF` decimal(4,2) DEFAULT NULL,
  `discount` decimal(8,2) DEFAULT NULL,
  `final_amount` decimal(10,2) DEFAULT NULL,
  `userid` int DEFAULT NULL,
  `creation_date` datetime DEFAULT NULL,
  `updation_date` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transaction`
--

LOCK TABLES `transaction` WRITE;
/*!40000 ALTER TABLE `transaction` DISABLE KEYS */;
INSERT INTO `transaction` VALUES (1,'SI','D','2026-04-30 00:00:00','Bill -01',30,100.00,2.00,2.00,100.00,1,NULL,NULL);
/*!40000 ALTER TABLE `transaction` ENABLE KEYS */;
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
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transaction_items`
--

LOCK TABLES `transaction_items` WRITE;
/*!40000 ALTER TABLE `transaction_items` DISABLE KEYS */;
INSERT INTO `transaction_items` VALUES (1,1,1,10.00,10.00,100.00,5.00,5.00,NULL,NULL),(2,1,2,5.00,50.00,250.00,5.00,5.00,NULL,NULL);
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
  `user_id` varchar(50) DEFAULT NULL,
  `password` varchar(100) DEFAULT NULL,
  `name` varchar(45) DEFAULT NULL,
  `userrole` int DEFAULT NULL,
  `rights` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user`
--

LOCK TABLES `user` WRITE;
/*!40000 ALTER TABLE `user` DISABLE KEYS */;
INSERT INTO `user` VALUES (1,'admin','$2b$10$GFv2PlPlubZmvOQGPwbdS.L9ZSP11SSLG5yRLAVgTRiOLikJe0ihe','Admin',1,NULL),(2,'md','$2a$10$s/WbEiaUb4zM6R9pdmREkuSsJtqAyg1V2bC0qGK//fFPJMMA55W9S','md',1,NULL);
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
  `role` varchar(45) DEFAULT NULL,
  `rights` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `userrole`
--

LOCK TABLES `userrole` WRITE;
/*!40000 ALTER TABLE `userrole` DISABLE KEYS */;
INSERT INTO `userrole` VALUES (1,'admin','1,2,3,4,5,6,7,8,9'),(2,'guest','1,2');
/*!40000 ALTER TABLE `userrole` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-05-02 23:40:57
