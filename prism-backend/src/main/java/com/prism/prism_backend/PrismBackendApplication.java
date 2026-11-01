// PrismBackendApplication.java
package com.prism.prism_backend;

import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class PrismBackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(PrismBackendApplication.class, args);
    }

    // ★ 起動直後にプールをチェックし、5個まで補充を開始
    @Bean
    public CommandLineRunner warmUpPool(InitialDataService initialDataService) {
        return args -> {
            initialDataService.initPool();
        };
    }
}
