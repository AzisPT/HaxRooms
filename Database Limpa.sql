-- --------------------------------------------------------
-- Anfitrião:                    192.168.1.1
-- Versão do servidor:           8.0.31 - MySQL Community Server - GPL
-- SO do servidor:               Win64
-- HeidiSQL Versão:              12.4.0.6659
-- --------------------------------------------------------

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8 */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


-- A despejar estrutura da base de dados para haxball
CREATE DATABASE IF NOT EXISTS `haxball` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `haxball`;

-- A despejar estrutura para tabela haxball.bans
CREATE TABLE IF NOT EXISTS `bans` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` text,
  `time` datetime DEFAULT NULL,
  `reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `banned_by` text,
  `conn` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `auth` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9779 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Aqui todos os bans são armazenados.';

-- Exportação de dados não seleccionada.

-- A despejar estrutura para tabela haxball.comments
CREATE TABLE IF NOT EXISTS `comments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `comentador` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `noperfil` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `comment` longtext,
  `when` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=33 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Local onde os comentários nos perfis são guardados.';

-- Exportação de dados não seleccionada.

-- A despejar estrutura para tabela haxball.mutes
CREATE TABLE IF NOT EXISTS `mutes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` text,
  `time` datetime DEFAULT NULL,
  `reason` text,
  `muted_by` text,
  `conn` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `auth` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=128 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Aqui todos os mutes são armazenados.';

-- Exportação de dados não seleccionada.

-- A despejar estrutura para tabela haxball.players
CREATE TABLE IF NOT EXISTS `players` (
  `id` int NOT NULL AUTO_INCREMENT,
  `game_id` int DEFAULT '0',
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password` text COLLATE utf8mb4_unicode_ci,
  `loggedIn` int DEFAULT '0',
  `superAdmin` int DEFAULT '0',
  `elo` int DEFAULT '1000',
  `games` int DEFAULT '0',
  `goals` int DEFAULT '0',
  `assists` int DEFAULT '0',
  `ag` int DEFAULT '0',
  `cs` int DEFAULT '0',
  `wins` int DEFAULT '0',
  `losses` int DEFAULT '0',
  `conn` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `auth` text COLLATE utf8mb4_unicode_ci,
  `email` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `emailtoken` tinytext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `emailconfirmed` int DEFAULT '0',
  `password_token` tinytext COLLATE utf8mb4_unicode_ci,
  `biografia` text COLLATE utf8mb4_unicode_ci,
  `avatar` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT '/imagens/perfis/AvatarDefault.png',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3174 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Onde todos os dados dos jogadores são guardados.';

-- Exportação de dados não seleccionada.

-- A despejar estrutura para tabela haxball.streak
CREATE TABLE IF NOT EXISTS `streak` (
  `games` int DEFAULT NULL,
  `player1` text,
  `player2` text,
  `player3` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Local onde a topstreak é guardada.';

-- Exportação de dados não seleccionada.

/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;
