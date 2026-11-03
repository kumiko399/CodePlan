package dev.codeplan.config;

import org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class WindowsHttp {
    /** NIO2 uses Windows IO completion ports, avoiding AF_UNIX selector wake-up pipe failures on some Windows installations. */
    @Bean WebServerFactoryCustomizer<TomcatServletWebServerFactory> httpProtocol() {
        return factory -> factory.setProtocol("org.apache.coyote.http11.Http11Nio2Protocol");
    }
}
