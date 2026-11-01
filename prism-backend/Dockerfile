# 1. ビルド環境 (Java 23 / Maven)
FROM eclipse-temurin:23-jdk-alpine AS build
WORKDIR /app

# Maven Wrapper と設定をコピー
COPY .mvn/ .mvn
COPY mvnw pom.xml ./
RUN chmod +x mvnw
# 依存関係をあらかじめダウンロード
RUN ./mvnw dependency:go-offline

# ソースコードをコピーしてビルド
COPY src ./src
RUN ./mvnw clean package -DskipTests

# 2. 実行環境
FROM eclipse-temurin:23-jre-alpine
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar

# Spring Boot のポート 8080 を公開
EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]