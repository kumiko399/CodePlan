package dev.codeplan.model;

import java.util.List;

/** Shared IDs for task/rule validation, backup validation and statistics. */
public final class Categories {
    private Categories() {}
    public static final String PATTERN = "study|life|sport|algorithm|course|assignment|exam|reading|project|club|social|meal|rest|career";
    public static final String INPUT_PATTERN = PATTERN + "|c_[a-f0-9]{16}";
    public static final List<String> IDS = List.of(PATTERN.split("\\|"));
}
