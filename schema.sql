-- --------------------------------------------------------
-- Host:                         127.0.0.1
-- Server version:               12.2.2-MariaDB - MariaDB Server
-- Server OS:                    Win64
-- HeidiSQL Version:             12.16.0.7229
-- --------------------------------------------------------

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8 */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


-- Dumping database structure for stockeasy1
CREATE DATABASE IF NOT EXISTS `stockeasy1` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci */;
USE `stockeasy1`;

-- Dumping structure for table stockeasy1.auth
CREATE TABLE IF NOT EXISTS `auth` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('admin','manager','cashier') DEFAULT 'cashier',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Data exporting was unselected.

-- Dumping structure for table stockeasy1.categories
CREATE TABLE IF NOT EXISTS `categories` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `gst_type` enum('standard','variable','none') DEFAULT 'standard',
  `cgst_rate` decimal(5,2) DEFAULT 0.00,
  `sgst_rate` decimal(5,2) DEFAULT 0.00,
  `hsn_code` varchar(20) DEFAULT NULL,
  `lower_cgst` decimal(5,2) DEFAULT 0.00,
  `lower_sgst` decimal(5,2) DEFAULT 0.00,
  `higher_cgst` decimal(5,2) DEFAULT 0.00,
  `higher_sgst` decimal(5,2) DEFAULT 0.00,
  `gst_threshold` decimal(15,2) DEFAULT 0.00,
  `min_margin_type` enum('percentage','amount','none') DEFAULT 'none',
  `min_margin_value` decimal(10,2) DEFAULT 0.00,
  `allow_price_edit` tinyint(1) DEFAULT 1,
  `underprice_safety` tinyint(1) DEFAULT 1,
  `dynamic_price` tinyint(1) DEFAULT 0,
  `min_stock_alert` decimal(15,4) DEFAULT 0.0000,
  `buy_units` text DEFAULT NULL,
  `sell_units` text DEFAULT NULL,
  `serial_number_enabled` tinyint(1) DEFAULT 0,
  `has_variants` tinyint(1) DEFAULT 0,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `1` FOREIGN KEY (`created_by`) REFERENCES `auth` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Data exporting was unselected.

-- Dumping structure for table stockeasy1.category_attributes
CREATE TABLE IF NOT EXISTS `category_attributes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `category_id` int(11) NOT NULL,
  `attribute_name` varchar(50) NOT NULL,
  `attribute_values` text NOT NULL,
  `is_required` tinyint(1) DEFAULT 1,
  `sort_order` int(11) DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `category_id` (`category_id`),
  CONSTRAINT `1` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Data exporting was unselected.

-- Dumping structure for table stockeasy1.item_uoms
CREATE TABLE IF NOT EXISTS `item_uoms` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `item_id` int(11) NOT NULL,
  `uom_name` varchar(50) NOT NULL,
  `conversion_factor` decimal(15,4) NOT NULL DEFAULT 1.0000,
  `buy_price` decimal(15,2) DEFAULT 0.00,
  `sell_price` decimal(15,2) DEFAULT 0.00,
  `price_type` enum('fixed','calculated') DEFAULT 'fixed',
  `barcode` varchar(50) DEFAULT NULL,
  `can_buy` tinyint(1) DEFAULT 1,
  `can_sell` tinyint(1) DEFAULT 1,
  `is_base` tinyint(1) DEFAULT 0,
  `status` enum('active','inactive') DEFAULT 'active',
  PRIMARY KEY (`id`),
  KEY `item_id` (`item_id`),
  CONSTRAINT `1` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`),
  CONSTRAINT `chk_factor` CHECK (`conversion_factor` > 0),
  CONSTRAINT `chk_sell_price` CHECK (`sell_price` >= 0),
  CONSTRAINT `chk_buy_price` CHECK (`buy_price` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Data exporting was unselected.

-- Dumping structure for table stockeasy1.item_variants
CREATE TABLE IF NOT EXISTS `item_variants` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `item_id` int(11) NOT NULL,
  `sku` varchar(100) DEFAULT NULL,
  `attributes` text NOT NULL,
  `buy_price` decimal(15,2) DEFAULT 0.00,
  `sell_price` decimal(15,2) DEFAULT 0.00,
  `mrp` decimal(15,2) DEFAULT 0.00,
  `stock` decimal(15,4) DEFAULT 0.0000,
  `barcode` varchar(50) DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT 'active',
  PRIMARY KEY (`id`),
  UNIQUE KEY `sku` (`sku`),
  UNIQUE KEY `barcode` (`barcode`),
  KEY `item_id` (`item_id`),
  CONSTRAINT `1` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`),
  CONSTRAINT `chk_variant_sell` CHECK (`sell_price` >= 0),
  CONSTRAINT `chk_variant_buy` CHECK (`buy_price` >= 0)
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Data exporting was unselected.

-- Dumping structure for table stockeasy1.items
CREATE TABLE IF NOT EXISTS `items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `category_id` int(11) NOT NULL,
  `name` varchar(150) NOT NULL,
  `description` text DEFAULT NULL,
  `gst_type` enum('standard','variable','none') DEFAULT 'standard',
  `cgst_rate` decimal(5,2) DEFAULT 0.00,
  `sgst_rate` decimal(5,2) DEFAULT 0.00,
  `hsn_code` varchar(20) DEFAULT NULL,
  `lower_cgst` decimal(5,2) DEFAULT 0.00,
  `lower_sgst` decimal(5,2) DEFAULT 0.00,
  `higher_cgst` decimal(5,2) DEFAULT 0.00,
  `higher_sgst` decimal(5,2) DEFAULT 0.00,
  `gst_threshold` decimal(15,2) DEFAULT 0.00,
  `allow_price_edit` tinyint(1) DEFAULT 1,
  `underprice_safety` tinyint(1) DEFAULT 1,
  `dynamic_price` tinyint(1) DEFAULT 0,
  `min_margin_type` enum('percentage','amount','none') DEFAULT 'none',
  `min_margin_value` decimal(10,2) DEFAULT 0.00,
  `base_uom` varchar(50) NOT NULL,
  `base_stock` decimal(15,4) DEFAULT 0.0000,
  `min_stock_alert` decimal(15,4) DEFAULT 0.0000,
  `serial_number_enabled` tinyint(1) DEFAULT 0,
  `internal_barcode` varchar(50) DEFAULT NULL,
  `ean_upc` varchar(50) DEFAULT NULL,
  `tags` text DEFAULT NULL,
  `has_variants` tinyint(1) DEFAULT 0,
  `image_path` varchar(255) DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `internal_barcode` (`internal_barcode`),
  KEY `category_id` (`category_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `1` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`),
  CONSTRAINT `2` FOREIGN KEY (`created_by`) REFERENCES `auth` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Data exporting was unselected.

-- Dumping structure for table stockeasy1.packaging_sets
CREATE TABLE IF NOT EXISTS `packaging_sets` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `category_id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `set_type` enum('ratio','uniform','loose') NOT NULL,
  `size_ratios` text DEFAULT NULL,
  `total_pcs` int(11) DEFAULT 0,
  `is_template` tinyint(1) DEFAULT 0,
  `can_buy` tinyint(1) DEFAULT 1,
  `can_sell` tinyint(1) DEFAULT 0,
  `status` enum('active','inactive') DEFAULT 'active',
  PRIMARY KEY (`id`),
  KEY `category_id` (`category_id`),
  CONSTRAINT `1` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Data exporting was unselected.

-- Dumping structure for table stockeasy1.purchase_items
CREATE TABLE IF NOT EXISTS `purchase_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `purchase_id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `variant_id` int(11) DEFAULT NULL,
  `uom_id` int(11) NOT NULL,
  `quantity` decimal(15,4) NOT NULL,
  `conversion_factor` decimal(15,4) NOT NULL,
  `base_qty` decimal(15,4) NOT NULL,
  `unit_price` decimal(15,2) NOT NULL,
  `cgst_amount` decimal(15,2) DEFAULT 0.00,
  `sgst_amount` decimal(15,2) DEFAULT 0.00,
  `total_price` decimal(15,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `purchase_id` (`purchase_id`),
  KEY `item_id` (`item_id`),
  KEY `variant_id` (`variant_id`),
  KEY `uom_id` (`uom_id`),
  CONSTRAINT `1` FOREIGN KEY (`purchase_id`) REFERENCES `purchases` (`id`),
  CONSTRAINT `2` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`),
  CONSTRAINT `3` FOREIGN KEY (`variant_id`) REFERENCES `item_variants` (`id`),
  CONSTRAINT `4` FOREIGN KEY (`uom_id`) REFERENCES `item_uoms` (`id`),
  CONSTRAINT `chk_pur_qty` CHECK (`quantity` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Data exporting was unselected.

-- Dumping structure for table stockeasy1.purchases
CREATE TABLE IF NOT EXISTS `purchases` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `supplier_id` int(11) DEFAULT NULL,
  `purchase_number` varchar(20) NOT NULL,
  `seller_bill_number` varchar(50) DEFAULT NULL,
  `supplier_name` varchar(150) DEFAULT NULL,
  `total_amount` decimal(15,2) NOT NULL,
  `cgst_amount` decimal(15,2) DEFAULT 0.00,
  `sgst_amount` decimal(15,2) DEFAULT 0.00,
  `net_amount` decimal(15,2) NOT NULL,
  `notes` text DEFAULT NULL,
  `status` enum('completed','cancelled') DEFAULT 'completed',
  `created_by` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `purchase_number` (`purchase_number`),
  KEY `created_by` (`created_by`),
  KEY `supplier_id` (`supplier_id`),
  CONSTRAINT `1` FOREIGN KEY (`created_by`) REFERENCES `auth` (`id`),
  CONSTRAINT `2` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Data exporting was unselected.

-- Dumping structure for table stockeasy1.sale_items
CREATE TABLE IF NOT EXISTS `sale_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `sale_id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `variant_id` int(11) DEFAULT NULL,
  `uom_id` int(11) NOT NULL,
  `quantity` decimal(15,4) NOT NULL,
  `conversion_factor` decimal(15,4) NOT NULL,
  `base_qty` decimal(15,4) NOT NULL,
  `unit_price` decimal(15,2) NOT NULL,
  `cgst_amount` decimal(15,2) DEFAULT 0.00,
  `sgst_amount` decimal(15,2) DEFAULT 0.00,
  `total_price` decimal(15,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `sale_id` (`sale_id`),
  KEY `item_id` (`item_id`),
  KEY `variant_id` (`variant_id`),
  KEY `uom_id` (`uom_id`),
  CONSTRAINT `1` FOREIGN KEY (`sale_id`) REFERENCES `sales` (`id`),
  CONSTRAINT `2` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`),
  CONSTRAINT `3` FOREIGN KEY (`variant_id`) REFERENCES `item_variants` (`id`),
  CONSTRAINT `4` FOREIGN KEY (`uom_id`) REFERENCES `item_uoms` (`id`),
  CONSTRAINT `chk_sale_qty` CHECK (`quantity` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Data exporting was unselected.

-- Dumping structure for table stockeasy1.sales
CREATE TABLE IF NOT EXISTS `sales` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `sale_number` varchar(20) NOT NULL,
  `customer_name` varchar(150) DEFAULT 'Walk-in Customer',
  `total_amount` decimal(15,2) NOT NULL,
  `cgst_amount` decimal(15,2) DEFAULT 0.00,
  `sgst_amount` decimal(15,2) DEFAULT 0.00,
  `discount` decimal(15,2) DEFAULT 0.00,
  `net_amount` decimal(15,2) NOT NULL,
  `payment_method` enum('cash','card','upi') NOT NULL,
  `status` enum('completed','cancelled','refunded') DEFAULT 'completed',
  `created_by` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `sale_number` (`sale_number`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `1` FOREIGN KEY (`created_by`) REFERENCES `auth` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Data exporting was unselected.

-- Dumping structure for table stockeasy1.set_definitions
CREATE TABLE IF NOT EXISTS `set_definitions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `category_id` int(11) NOT NULL,
  `supplier_id` int(11) DEFAULT NULL,
  `name` varchar(100) NOT NULL,
  `set_type` enum('ratio','uniform','loose') DEFAULT 'uniform',
  `size_ratios` text DEFAULT NULL,
  `total_pcs` int(11) DEFAULT 0,
  `is_default` tinyint(1) DEFAULT 0,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_by` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `category_id` (`category_id`),
  KEY `created_by` (`created_by`),
  KEY `supplier_id` (`supplier_id`),
  CONSTRAINT `1` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`),
  CONSTRAINT `2` FOREIGN KEY (`created_by`) REFERENCES `auth` (`id`),
  CONSTRAINT `3` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Data exporting was unselected.

-- Dumping structure for table stockeasy1.stock_ledger
CREATE TABLE IF NOT EXISTS `stock_ledger` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `item_id` int(11) NOT NULL,
  `variant_id` int(11) DEFAULT NULL,
  `uom_id` int(11) NOT NULL,
  `transaction_type` enum('purchase','sale','adjustment','return') NOT NULL,
  `reference_id` int(11) NOT NULL,
  `reference_type` enum('purchase','sale','adjustment') NOT NULL,
  `quantity` decimal(15,4) NOT NULL,
  `base_qty` decimal(15,4) NOT NULL,
  `stock_before` decimal(15,4) NOT NULL,
  `stock_after` decimal(15,4) NOT NULL,
  `notes` text DEFAULT NULL,
  `created_by` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `item_id` (`item_id`),
  KEY `variant_id` (`variant_id`),
  KEY `uom_id` (`uom_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `1` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`),
  CONSTRAINT `2` FOREIGN KEY (`variant_id`) REFERENCES `item_variants` (`id`),
  CONSTRAINT `3` FOREIGN KEY (`uom_id`) REFERENCES `item_uoms` (`id`),
  CONSTRAINT `4` FOREIGN KEY (`created_by`) REFERENCES `auth` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Data exporting was unselected.

-- Dumping structure for table stockeasy1.suppliers
CREATE TABLE IF NOT EXISTS `suppliers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `contact` varchar(50) DEFAULT NULL,
  `location` varchar(100) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_by` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `1` FOREIGN KEY (`created_by`) REFERENCES `auth` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Data exporting was unselected.

/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;
