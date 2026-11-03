package dev.codeplan.config;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class LocalSecurity extends OncePerRequestFilter {
    private final byte[] token;
    public LocalSecurity(@Value("${app.token}") String token) {
        if(token.length()<24) throw new IllegalStateException("APP_TOKEN must contain at least 24 random characters");
        this.token=token.getBytes(StandardCharsets.UTF_8);
    }
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
        if(!request.getRequestURI().startsWith("/api/") || request.getRequestURI().equals("/api/health")) { chain.doFilter(request,response); return; }
        String supplied=request.getHeader("X-App-Token");
        if(supplied==null || !MessageDigest.isEqual(token,supplied.getBytes(StandardCharsets.UTF_8))) {
            response.setStatus(401); response.setContentType("application/json"); response.getWriter().write("{\"code\":\"UNAUTHORIZED\"}"); return;
        }
        chain.doFilter(request,response);
    }
}
