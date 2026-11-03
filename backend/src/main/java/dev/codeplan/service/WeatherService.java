package dev.codeplan.service;

import com.fasterxml.jackson.databind.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.*;
import org.springframework.stereotype.Service;

@Service
public class WeatherService {
    public record City(String name, double latitude, double longitude) {}
    public record Preferences(String mode, City city, List<City> cities) {
        public Preferences(String mode, City city) { this(mode,city,null); }
    }
    public record Forecast(JsonNode data, long fetchedAt, boolean stale) {}
    public record Display(String temperature,String wind,boolean clarity,boolean collapsed) {}
    private Display checkDisplay(Display d) {
        if(d==null || !Set.of("C","F").contains(Objects.toString(d.temperature(),"")) || !Set.of("ms","kmh").contains(Objects.toString(d.wind(),""))) throw new IllegalArgumentException("INVALID_INPUT");
        return d;
    }
    public synchronized Display display() {
        Path p=file.resolveSibling("weather-display.json");
        if(!Files.exists(p))return new Display("C","ms",false,false);
        try { if(Files.size(p)>1024)throw new IllegalStateException();return checkDisplay(json.readValue(Files.readAllBytes(p),Display.class)); }
        catch(Exception e){throw new IllegalStateException("WEATHER_PREFERENCES_INVALID");}
    }
    public synchronized Display saveDisplay(Display value) {
        checkDisplay(value);
        Path p=file.resolveSibling("weather-display.json"),tmp=p.resolveSibling("weather-display.json.tmp");
        try {Files.createDirectories(p.getParent());Files.write(tmp,json.writeValueAsBytes(value));
            try {Files.move(tmp,p,StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);}
            catch(AtomicMoveNotSupportedException e){Files.move(tmp,p,StandardCopyOption.REPLACE_EXISTING);}return value;
        }catch(Exception e){throw new IllegalStateException("WEATHER_PREFERENCES_FAILED");}
    }
    private record Cached(JsonNode data, long fetchedAt) {}
    private final ObjectMapper json;
    private final WeatherHttp http;
    private final Path file;
    private final Clock clock;
    private final Map<String, Cached> cache = new LinkedHashMap<>();
    private final Map<String, Long> failed = new LinkedHashMap<>();
    private long windowStart;
    private int requests;
    @Autowired public WeatherService(ObjectMapper json, WeatherHttp http, @Value("${app.data-dir}") String dir) {
        this(json,http,Path.of(dir),Clock.systemUTC());
    }
    WeatherService(ObjectMapper json, WeatherHttp http, Path dir, Clock clock) {
        this.json=json; this.http=http; this.file=dir.resolve("weather-preferences.json"); this.clock=clock;
    }
    public synchronized Preferences preferences() {
        if (!Files.exists(file)) return new Preferences("unset",null);
        try {
            if(Files.size(file)>4096) throw new IllegalStateException();
            return validate(json.readValue(Files.readAllBytes(file),Preferences.class));
        } catch(Exception e) { throw new IllegalStateException("WEATHER_PREFERENCES_INVALID"); }
    }
    public synchronized Preferences save(Preferences value) {
        value=validate(value);
        try {
            Files.createDirectories(file.getParent());
            Path temp=file.resolveSibling("weather-preferences.json.tmp");
            Files.write(temp,json.writeValueAsBytes(value));
            try { Files.move(temp,file,StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING); }
            catch(AtomicMoveNotSupportedException e) { Files.move(temp,file,StandardCopyOption.REPLACE_EXISTING); }
            return value;
        } catch(Exception e) { throw new IllegalStateException("WEATHER_PREFERENCES_FAILED"); }
    }
    private Preferences validate(Preferences p) {
        if(p==null || p.mode()==null || !Set.of("unset","manual","auto").contains(p.mode())) throw new IllegalArgumentException("INVALID_INPUT");
        if(p.mode().equals("unset")) return new Preferences("unset",null,List.of());
        List<City> cities=new ArrayList<>();
        if(p.cities()!=null) {
            if(p.cities().size()>8) throw new IllegalArgumentException("INVALID_INPUT");
            for(City item:p.cities()) {
                City checked=validateCity(item);
                if(cities.stream().noneMatch(c->c.latitude()==checked.latitude()&&c.longitude()==checked.longitude())) cities.add(checked);
            }
        }
        if(p.mode().equals("auto")) return new Preferences("auto",null,List.copyOf(cities));
        City selected=validateCity(p.city());
        if(cities.stream().noneMatch(c->c.latitude()==selected.latitude()&&c.longitude()==selected.longitude())) cities.add(selected);
        if(cities.size()>8) throw new IllegalArgumentException("INVALID_INPUT");
        return new Preferences("manual",selected,List.copyOf(cities));
    }
    private City validateCity(City c) {
        if(c==null || c.name()==null || c.name().isBlank() || c.name().length()>100 || c.name().chars().anyMatch(Character::isISOControl)) throw new IllegalArgumentException("INVALID_INPUT");
        coordinates(c.latitude(),c.longitude());
        return new City(c.name().strip(),rounded(c.latitude()),rounded(c.longitude()));
    }
    static void coordinates(double lat,double lon) {
        if(!Double.isFinite(lat)||!Double.isFinite(lon)||lat< -90||lat>90||lon< -180||lon>180) throw new IllegalArgumentException("INVALID_INPUT");
    }
    static double rounded(double n) { return Math.round(n*100.0)/100.0; }
    private JsonNode fetch(String key,String url,long ttl,boolean stale) {
        long now=clock.instant().getEpochSecond();
        Cached old=cache.get(key);
        if(old!=null && now-old.fetchedAt()<ttl) return old.data();
        if(now<failed.getOrDefault(key,0L)) {
            if(stale && old!=null && now-old.fetchedAt()<21600) return old.data();
            throw new IllegalStateException("WEATHER_UNAVAILABLE");
        }
        if(now-windowStart>=60) {windowStart=now;requests=0;}
        if(requests>=30) throw new IllegalStateException("WEATHER_RATE_LIMITED");
        requests++;
        try {
            JsonNode data=http.get(URI.create(url));
            if(key.startsWith("forecast:")) validateForecast(data);
            cache.put(key,new Cached(data,now));
            while(cache.size()>64) cache.remove(cache.keySet().iterator().next());
            failed.remove(key);
            return data;
        } catch(IllegalStateException e) {
            failed.put(key,now+("WEATHER_RATE_LIMITED".equals(e.getMessage())?300:60));
            while(failed.size()>64) failed.remove(failed.keySet().iterator().next());
            if(stale && old!=null && now-old.fetchedAt()<21600) return old.data();
            throw e;
        }
    }
    static void validateForecast(JsonNode data) {
        if(!data.path("current").path("time").isNumber() || !data.path("current").path("temperature_2m").isNumber()
            || !data.path("hourly").path("time").isArray() || data.path("hourly").path("time").size()<24
            || !data.path("daily").path("time").isArray() || data.path("daily").path("time").isEmpty()
            || !data.path("current_units").path("temperature_2m").asText().equals("°C")
            || !data.path("current_units").path("wind_speed_10m").asText().equals("m/s")) throw new IllegalStateException("WEATHER_UNAVAILABLE");
        try { ZoneId.of(data.path("timezone").asText()); } catch(Exception e) { throw new IllegalStateException("WEATHER_UNAVAILABLE"); }
    }
    public synchronized Forecast forecast(double latitude,double longitude) {
        coordinates(latitude,longitude);
        String lat=Double.toString(rounded(latitude)),lon=Double.toString(rounded(longitude)),key="forecast:"+lat+","+lon;
        JsonNode data=fetch(key,"https://api.open-meteo.com/v1/forecast?latitude="+lat+"&longitude="+lon
            +"&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,cloud_cover"
            +"&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,pressure_msl,weather_code,precipitation_probability,is_day,uv_index,visibility,dew_point_2m"
            +"&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset,precipitation_sum"
            +"&timezone=auto&timeformat=unixtime&forecast_days=7&wind_speed_unit=ms&models=best_match",900,true);
        long fetchedAt=cache.get(key).fetchedAt();
        return new Forecast(data,fetchedAt,clock.instant().getEpochSecond()-fetchedAt>=900);
    }
    public synchronized List<City> cities(String query,String language) {
        if(query==null || query.strip().length()<2 || query.length()>80 || !Set.of("zh","en").contains(language)) throw new IllegalArgumentException("INVALID_INPUT");
        String q=URLEncoder.encode(query.strip(),StandardCharsets.UTF_8),key="cities:"+language+":"+q;
        JsonNode data=fetch(key,"https://geocoding-api.open-meteo.com/v1/search?name="+q+"&language="+language+"&count=20&format=json",86400,false);
        List<City> result=new ArrayList<>();
        for(JsonNode c:data.path("results")) {
            if(!c.path("latitude").isNumber() || !c.path("longitude").isNumber()) continue;
            String label=c.path("name").asText();
            for(String field:List.of("admin1","country")) {String v=c.path(field).asText();if(!v.isBlank() && !label.contains(v)) label+=" · "+v;}
            if(!label.isBlank() && label.length()<=100) result.add(new City(label,rounded(c.path("latitude").asDouble()),rounded(c.path("longitude").asDouble())));
        }
        return result;
    }
    public synchronized City locate() {
        if(!preferences().mode().equals("auto")) throw new IllegalArgumentException("WEATHER_LOCATION_CONSENT_REQUIRED");
        JsonNode d=fetch("location","https://ipwho.is/?fields=success,city,region,country,latitude,longitude",3600,false);
        if(!d.path("success").asBoolean() || !d.path("latitude").isNumber() || !d.path("longitude").isNumber() || d.path("city").asText().isBlank())
            throw new IllegalStateException("WEATHER_LOCATION_FAILED");
        double lat=d.path("latitude").asDouble(),lon=d.path("longitude").asDouble();coordinates(lat,lon);
        return new City(d.path("city").asText()+" · "+d.path("country").asText(),rounded(lat),rounded(lon));
    }
}
