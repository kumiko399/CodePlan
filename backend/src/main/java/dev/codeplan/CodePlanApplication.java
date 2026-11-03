package dev.codeplan;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class CodePlanApplication {
    public static void main(String[] args) { SpringApplication.run(CodePlanApplication.class, args); }
}
