package dev.codeplan.service;

import com.fasterxml.jackson.databind.*;
import java.net.URI;
import javax.net.ssl.HttpsURLConnection;
import java.util.Set;
import org.springframework.stereotype.Component;

/** Fixed public providers only. Never forwards the local application's token. */
@Component
public class WeatherHttp {
    private final ObjectMapper json;
    public WeatherHttp(ObjectMapper json) { this.json = json; }
    public JsonNode get(URI uri) {
        if (!"https".equals(uri.getScheme()) || !Set.of("api.open-meteo.com", "geocoding-api.open-meteo.com", "ipwho.is").contains(uri.getHost()))
            throw new IllegalArgumentException("INVALID_WEATHER_PROVIDER");
        HttpsURLConnection connection = null;
        try {
            connection = (HttpsURLConnection) uri.toURL().openConnection();
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(12000);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("User-Agent", "CodePlan/0.1.0 personal-noncommercial");
            connection.setRequestProperty("Accept", "application/json");
            if (connection.getResponseCode() == 429) throw new IllegalStateException("WEATHER_RATE_LIMITED");
            if (connection.getResponseCode() != 200) throw new IllegalStateException("WEATHER_UNAVAILABLE");
            byte[] bytes;
            try (var input = connection.getInputStream()) { bytes = input.readNBytes(1_000_001); }
            if (bytes.length > 1_000_000) throw new IllegalStateException("WEATHER_UNAVAILABLE");
            JsonNode result = json.readTree(bytes);
            if (result == null || !result.isObject()) throw new IllegalStateException("WEATHER_UNAVAILABLE");
            return result;
        } catch (IllegalStateException e) { throw e; }
        catch (Exception e) { throw new IllegalStateException("WEATHER_UNAVAILABLE"); }
        finally { if (connection != null) connection.disconnect(); }
    }
}
