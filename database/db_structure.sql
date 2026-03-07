CREATE TABLE `category` (
  `id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `name` varchar(45)
);

CREATE TABLE `customer` (
  `id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `contact_no` varchar(10),
  `city` varchar(50),
  `gstin` varchar(15),
  `group` int,
  `address` varchar(100),
  `opening` decimal(10,2),
  `credit` decimal(10,2),
  `debit` decimal(10,2),
  `closing` decimal(10,2)
);

CREATE TABLE `group` (
  `id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `name` varchar(45)
);

CREATE TABLE `product` (
  `id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `name` varchar(100),
  `category` varchar(45),
  `purc_rate` decimal(8,2),
  `sale_rate` decimal(8,2),
  `hsn_code` varchar(45),
  `barcode` varchar(6),
  `o_qty` decimal(8,2),
  `p_qty` decimal(8,2),
  `s_qty` decimal(8,2),
  `c_qty` decimal(8,2)
);

CREATE TABLE `transaction` (
  `id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `transaction_id` int NOT NULL,
  `date` datetime,
  `bill_no` varchar(45),
  `customer_id` int,
  `product_id` int,
  `s_qty` decimal(8,2),
  `p_qty` decimal(8,2),
  `rate` decimal(8,2),
  `taxable_amount` decimal(10,2),
  `CGST` decimal(8,2),
  `SGST` decimal(8,2),
  `roundoff` decimal(4,2),
  `discount` decimal(8,2),
  `final_amount` decimal(10,2),
  `userid` int,
  `creation_date` datetime DEFAULT (CURRENT_TIMESTAMP),
  `updation_date` datetime DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE `user` (
  `id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `userid` varchar(50),
  `password` varchar(45),
  `name` varchar(45),
  `userrole` int,
  `rights` varchar(100)
);

CREATE TABLE `userrole` (
  `id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `role` varchar(45),
  `rights` varchar(100)
);

ALTER TABLE `customer` ADD FOREIGN KEY (`group`) REFERENCES `group` (`id`);

ALTER TABLE `product` ADD FOREIGN KEY (`category`) REFERENCES `category` (`id`);

ALTER TABLE `user` ADD FOREIGN KEY (`userrole`) REFERENCES `userrole` (`id`);

ALTER TABLE `transaction` ADD FOREIGN KEY (`userid`) REFERENCES `user` (`id`);

ALTER TABLE `transaction` ADD FOREIGN KEY (`customer_id`) REFERENCES `customer` (`id`);

ALTER TABLE `transaction` ADD FOREIGN KEY (`product_id`) REFERENCES `product` (`id`);
