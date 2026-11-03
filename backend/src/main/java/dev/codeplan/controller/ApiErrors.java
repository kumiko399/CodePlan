package dev.codeplan.controller;

import java.util.*;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.*;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice
public class ApiErrors {
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<?> validation(MethodArgumentNotValidException e) { return ResponseEntity.badRequest().body(Map.of("code","INVALID_INPUT","fields",e.getBindingResult().getFieldErrors().stream().map(f -> f.getField()).distinct().toList())); }
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<?> bad(IllegalArgumentException e) { String code=e.getMessage(); return ResponseEntity.badRequest().body(Map.of("code",code!=null && code.matches("[A-Z_]+") ? code : "INVALID_INPUT")); }
    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<?> missing(NoSuchElementException e) { return ResponseEntity.status(404).body(Map.of("code",e.getMessage())); }
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<?> conflict(Exception e) { return ResponseEntity.status(409).body(Map.of("code","DATA_CONFLICT")); }
    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<?> failed(IllegalStateException e) { String code=e.getMessage(); return ResponseEntity.status(500).body(Map.of("code",code!=null && code.matches("[A-Z_]+") ? code : "OPERATION_FAILED")); }
}
