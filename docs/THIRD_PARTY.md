# Third-party software and distribution review

Review date: 2026-11-03. **Not a clearance to redistribute.** Original project source is under the root LICENSE; its non-commercial restriction is not MIT and is not an OSI open-source license. Third-party components retain their own licenses. A project disclaimer cannot replace their permissions or obligations.

## Source dependencies

Source dependency added in 0.1.1 (reviewed 2026-11-05): lunar-javascript 1.7.7, MIT, copyright (c) 2018 6tail. The original license is preserved in [licenses/lunar-javascript-LICENSE.txt](licenses/lunar-javascript-LICENSE.txt). This component is loaded only for the home almanac. The source archive contains integration code and dependency manifests, not the library, its embedded Yi/Ji table, scraped materials or compiled bundles. Upstream documentation attributes the table to research on scraped website materials; the full data rights chain remains unverified. Review DATA_SOURCES.md before distributing bundled data or binaries. The existing project source license does not replace its MIT license.

Exact npm versions and declared license metadata, including transitive dependencies, are listed in [DEPENDENCY_INVENTORY.md](DEPENDENCY_INVENTORY.md). Metadata is not a substitute for the actual package LICENSE/NOTICE files. Java dependencies are declared in `backend/pom.xml`; the final resolved Maven graph and all bundled JAR notices must be collected before binary distribution.

| Component | Declared license / review point |
| --- | --- |
| Vue, Vue Router, Pinia, Vue I18n, Element Plus, Vite, Electron | MIT; retain copyright and permission notices for distributed copies |
| ECharts, Spring Boot, MyBatis | Apache-2.0; retain license and applicable upstream NOTICE files |
| MySQL Connector/J (runtime dependency in backend JAR) | GPLv2 with applicable additional permissions / Universal FOSS Exception; inspect the exact artifact's LICENSE. Do not assume the exception covers a custom non-commercial project license |
| H2 (tests) | MPL-2.0 / EPL-1.0 per upstream distribution; verify resolved artifact and keep test/runtime scope distinct |
| OpenJDK / Azul Zulu | GPLv2 with Classpath Exception for applicable parts; preserve component-specific legal files and assess source distribution duties |
| MySQL Community Server | GPLv2 and bundled component notices; corresponding source obligations require a concrete compliant plan |
| Microsoft Visual C++ runtime | Proprietary redistribution terms, not covered by the project's source license |

## Current release blockers

- [Oracle licensing guidance](https://www.mysql.com/about/legal/licensing/oem/) and [Universal FOSS Exception](https://oss.oracle.com/licenses/universal-foss-exception/) must be assessed against the final project license. A custom non-commercial restriction does not qualify merely because source code is visible. Do not label the current combined JAR/installer redistributable until a compatible dependency/license arrangement or explicit permission is established.
- `scripts/prepare-runtime.ps1` currently copies VC runtime DLLs from the JDK or System32. Possession of installed DLLs is not proof of redistribution rights. Validate an authorized source and applicable [Microsoft redistribution terms](https://learn.microsoft.com/en-us/cpp/windows/redistributing-visual-cpp-files?view=msvc-170) before shipping; this documentation task does not change that script.
- Generic upstream download links alone are not a completed corresponding-source delivery mechanism. Record exact MySQL/JDK builds, checksums, source archives, modifications and build instructions, then select a license-compliant delivery method.
- Electron's Chromium notices, frontend bundled code licenses, Spring Boot nested JAR notices and all other shipped components need release-specific collection. This file is an overview, not a complete NOTICE bundle or SBOM.

## Bundled components (local development package)

The desktop package includes third-party runtime components in order to run without a separately installed Java or MySQL service.

- Electron: https://github.com/electron/electron — MIT; its distribution includes LICENSE and LICENSES.chromium.html.
- OpenJDK runtime, assembled with jlink from Azul Zulu Java 21: https://www.azul.com/downloads/ — licenses and notices are preserved under java/legal/.
- MySQL Community Server 8.0: https://dev.mysql.com/downloads/mysql/ — the original MySQL LICENSE, README, and build/source information are preserved under mysql/ and mysql/docs/. MySQL upstream source distributions are available at https://dev.mysql.com/downloads/mysql/ (source code selection).
- Microsoft Visual C++ runtime DLLs are included beside the MySQL executables as application-local runtime dependencies.
- Vue, Vue Router, Pinia, Vue I18n, Element Plus: MIT. ECharts: Apache-2.0. Spring Boot: Apache-2.0. MyBatis: Apache-2.0. Their exact versions are recorded in package locks and backend/pom.xml.

This project currently produces a local, unsigned Windows installer for development and evaluation. Public distribution needs a separate license, source-obligation and security review. Code signing is recommended for publisher identity and integrity, but does not establish license compliance and is not itself an open-source licensing requirement. No certificate or signing identity is assumed or embedded.

## Weather services (V1.0)

- Forecast data: [Open-Meteo](https://open-meteo.com/) under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Displayed values are rounded and formatted; weather codes become emoji/text. The free endpoint is used for non-commercial purposes subject to its [terms](https://open-meteo.com/en/terms).
- The [forecast API](https://open-meteo.com/en/docs) uses best_match. Open-Meteo aggregates numerical models from weather agencies; the app does not claim a direct feed from any particular agency or live station observations.
- City search: [Open-Meteo geocoding](https://open-meteo.com/en/docs/geocoding-api), using [GeoNames](https://www.geonames.org/).
- Optional approximate IP location: [ipwho.is documentation](https://ipwhois.io/documentation). Called only after the user enables this feature. Location results can be affected by VPNs and network routing.
- Forecast requests send city coordinates, not tasks or notes. Location requests expose the network public IP to the provider; raw IP addresses are not stored in application preferences or backups.

Detailed attribution, transformations and API/data-license distinctions: [DATA_SOURCES.md](DATA_SOURCES.md). All external network services can observe request IP metadata, not only the location provider.
