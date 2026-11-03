package dev.codeplan.controller;

import dev.codeplan.service.WeatherService;
import dev.codeplan.service.WeatherService.*;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/weather")
public class WeatherController {
    private final WeatherService weather;
    public WeatherController(WeatherService weather) { this.weather=weather; }
    @GetMapping("/preferences") public Preferences preferences() { return weather.preferences(); }
    @PutMapping("/preferences") public Preferences save(@RequestBody Preferences value) { return weather.save(value); }
    @GetMapping("/forecast") public Forecast forecast(@RequestParam double latitude,@RequestParam double longitude) { return weather.forecast(latitude,longitude); }
    @GetMapping("/cities") public List<City> cities(@RequestParam String q,@RequestParam(defaultValue="zh") String language) { return weather.cities(q,language); }
    @GetMapping("/location") public City location() { return weather.locate(); }
    @GetMapping("/display") public Display display() { return weather.display(); }
    @PutMapping("/display") public Display display(@RequestBody Display value) { return weather.saveDisplay(value); }
}
