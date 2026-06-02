// VARIABLES GLOBALES
        let carrerasCache = [];
        let sprintsCache = [];
        let f1PilotosCache = [];
        let f1ConstCache = [];
        let f15PilotosCache = [];
        
        let pilotoVivoEnfocado = null;
        let intervalLive = null;
        let modoLiveActual = 'f1';
        let liveDriversCache = null;
        let liveSessionCache = null;
        let isUpdatingLive = false;
        let liveUpdateVersion = 0;
        let modoDemoLive = false;
        let trackBounds = null;
        // Demo: Abu Dhabi 2025 Race (session_key=9839) — sesión histórica estable para datos de ejemplo
        const SESSION_ID_DEMO = 9839;
        const DEMO_SESSION_LABEL = "Abu Dhabi 2025 (Demo)";
        const DEMO_SESSION_TYPE = "Datos históricos — Carrera Abu Dhabi 2025";
        const DEMO_LAP_FILTER = "&lap_number<=3";
        let anioActual = "current"; 
        let modoDetalladoActual = "pilotos";
        let pilotoPerfilActual = null;
        const perfilTemporadasCache = {};
        const ANIO_ACTUAL_VISIBLE = new Date().getFullYear();

        // CONSTANTES DEL SISTEMA DE PUNTUACIÓN
        const PUNTOS_CARRERA = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
        const PUNTOS_SPRINT = [8, 7, 6, 5, 4, 3, 2, 1];

        // DICCIONARIO INTERNACIONAL PARA CIRCUITO A ABREVIACIÓN DE 3 LETRAS REALES
        const MAPA_CIRCUITOS = {
            "albert_park": "AUS", "bahrain": "BHR", "jeddah": "SAU", "baku": "AZE", "miami": "MIA",
            "monaco": "MON", "catalunya": "ESP", "villeneuve": "CAN", "red_bull_ring": "AUT",
            "silverstone": "GBR", "hungaroring": "HUN", "spa": "BEL", "zandvoort": "NED",
            "monza": "ITA", "marina_bay": "SIN", "suzuka": "JPN", "losail": "QAT", "americas": "USA",
            "rodriguez": "MEX", "interlagos": "BRA", "vegas": "LVG", "yas_marina": "UAE", "shanghai": "CHN",
            "imola": "EMI", "portimao": "POR", "sochi": "RUS", "mugello": "MUG", "nurburgring": "NUR",
            "istanbul": "TUR", "jerez": "JER", "hockenheim": "GER", "sepang": "MAL", "monjuich": "MNE"
        };

        // DICCIONARIO PARA LAS BANDERAS DE NACIONALIDAD
        const MAPA_BANDERAS = {
            "British": "gb", "French": "fr", "German": "de", "Italian": "it", "Spanish": "es",
            "Dutch": "nl", "Monégasque": "mc", "Monegasque": "mc", "Australian": "au", "Canadian": "ca",
            "Japanese": "jp", "Mexican": "mx", "American": "us", "Finnish": "fi", "Danish": "dk",
            "Chinese": "cn", "Thai": "th", "New Zealander": "nz", "Brazilian": "br", "Argentine": "ar",
            "Swiss": "ch", "Austrian": "at", "Belgian": "be", "Polish": "pl", "Russian": "ru",
            "Saudi": "sa", "Emirati": "ae", "Qatari": "qa", "Swedish": "se", "Venezuelan": "ve",
            "Indonesian": "id", "Portuguese": "pt", "Irish": "ie", "Hungarian": "hu", "Colombian": "co",
            "South African": "za", "Czech": "cz", "Uruguayan": "uy", "Chilean": "cl", "Indian": "in",
            "Malaysian": "my", "Surinamese": "sr", "Rhodesian": "zw", "East German": "de",
            "American-Italian": "us", "Liechtensteiner": "li", "Moroccan": "ma"
        };

        function obtenerAbvCircuito(race) {
            const id = race.Circuit.circuitId;
            if (MAPA_CIRCUITOS[id]) return MAPA_CIRCUITOS[id];
            return race.Circuit.Location.country.substring(0, 3).toUpperCase();
        }

        function obtenerCodigoBandera(nacionalidad) {
            return MAPA_BANDERAS[nacionalidad] || MAPA_BANDERAS[nacionalidad.trim()] || "";
        }

        function generarBanderaImg(nacionalidad) {
            const codigo = obtenerCodigoBandera(nacionalidad);
            if (!codigo) return '';
            return `<img class="banderita" src="https://flagcdn.com/w20/${codigo}.png" alt="${nacionalidad}">`;
        }

        async function obtenerCarrerasPaginadas(urlBase, campoResultados) {
            const carrerasPorRonda = new Map();
            let offset = 0;
            let total = Infinity;

            while (offset < total) {
                const separador = urlBase.includes('?') ? '&' : '?';
                const res = await fetch(`${urlBase}${separador}limit=100&offset=${offset}`);
                if (!res.ok) throw new Error(`Error API ${res.status}: ${urlBase}`);

                const data = await res.json();
                const mrData = data.MRData || {};
                const carreras = mrData.RaceTable?.Races || [];
                const limite = parseInt(mrData.limit || "100", 10);

                total = parseInt(mrData.total || carreras.length, 10);
                if (!carreras.length || !limite) break;

                carreras.forEach(carrera => {
                    const existentes = carrerasPorRonda.get(carrera.round);
                    const resultadosNuevos = carrera[campoResultados] || [];

                    if (!existentes) {
                        carrerasPorRonda.set(carrera.round, {
                            ...carrera,
                            [campoResultados]: [...resultadosNuevos]
                        });
                        return;
                    }

                    const idsExistentes = new Set(
                        (existentes[campoResultados] || []).map(res => res.Driver?.driverId || res.position)
                    );

                    resultadosNuevos.forEach(res => {
                        const id = res.Driver?.driverId || res.position;
                        if (!idsExistentes.has(id)) {
                            existentes[campoResultados].push(res);
                            idsExistentes.add(id);
                        }
                    });
                });

                offset += limite;
            }

            return Array.from(carrerasPorRonda.values()).sort((a, b) => Number(a.round) - Number(b.round));
        }

        function esEquipoExcluidoF15(nombreEscuderia) {
            if (!nombreEscuderia) return false;
            const excluidos = ['ferrari', 'mclaren', 'mercedes', 'red bull'];
            return excluidos.some(e => nombreEscuderia.toLowerCase().includes(e));
        }

        function cerrarModal() { document.getElementById('modal-carrera').style.display = 'none'; }
        function cerrarModalPiloto() { document.getElementById('modal-piloto').style.display = 'none'; }

        function cambiarPestaña(event, tabId) {
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
            event.currentTarget.classList.add('active');
        }

        // CONTROLADOR DE APARTADOS PRINCIPALES
        function cambiarApartado(seccion) {
            const tabDashboard = document.getElementById('apartado-dashboard');
            const tabDetallado = document.getElementById('apartado-detallado');
            const tabEnVivo = document.getElementById('apartado-envivo');
            const btnDash = document.getElementById('nav-tab-dashboard');
            const btnDet = document.getElementById('nav-tab-detallado');
            const btnLive = document.getElementById('nav-tab-envivo');
            
            // Detener updates si salimos de vivo
            if (intervalLive) { clearInterval(intervalLive); intervalLive = null; }

            [tabDashboard, tabDetallado, tabEnVivo].forEach(t => t.style.display = 'none');
            [btnDash, btnDet, btnLive].forEach(b => b.classList.remove('active'));

            if (seccion === 'dashboard') {
                tabDashboard.style.display = 'flex';
                btnDash.classList.add('active');
            } else if (seccion === 'detallado') {
                tabDetallado.style.display = 'flex';
                btnDet.classList.add('active');
                renderizarMatricesDetalladas();
            } else if (seccion === 'envivo') {
                tabEnVivo.style.display = 'flex';
                btnLive.classList.add('active');
                iniciarLiveUpdates();
            }
        }

        function cambiarModoDetallado(modo) {
            modoDetalladoActual = modo;
            document.getElementById('btn-det-pilotos').classList.toggle('active', modo === 'pilotos');
            document.getElementById('btn-det-const').classList.toggle('active', modo === 'constructores');
            renderizarMatricesDetalladas();
        }

        function inicializarSelectorAnos() {
            const select = document.getElementById('selector-ano');
            if(!select || select.children.length > 0) return; 
            
            let optCurrent = document.createElement('option');
            optCurrent.value = "current";
            optCurrent.innerText = `${ANIO_ACTUAL_VISIBLE} (Actual)`;
            select.appendChild(optCurrent);
            
            for (let a = 2025; a >= 2014; a--) {
                let opt = document.createElement('option');
                opt.value = a;
                opt.innerText = a;
                select.appendChild(opt);
            }
        }

        // FUNCIONES AUXILIARES PARA EL CÁLCULO CELDA POR CELDA EN LAS MATRICES DETALLADAS
        function calcularPuntosMortalEnCarrera(driverId, round) {
            let puntos = 0;
            const carrera = carrerasCache.find(c => c.round === round);
            if (carrera && carrera.Results) {
                let posF15 = 0;
                for (let res of carrera.Results) {
                    if (!esEquipoExcluidoF15(res.Constructor.name)) {
                        if (res.Driver.driverId === driverId) {
                            if (posF15 < PUNTOS_CARRERA.length) puntos += PUNTOS_CARRERA[posF15];
                            break;
                        }
                        posF15++;
                    }
                }
            }
            const sprint = sprintsCache.find(s => s.round === round);
            if (sprint && sprint.SprintResults) {
                let posF15 = 0;
                for (let res of sprint.SprintResults) {
                    if (!esEquipoExcluidoF15(res.Constructor.name)) {
                        if (res.Driver.driverId === driverId) {
                            if (posF15 < PUNTOS_SPRINT.length) puntos += PUNTOS_SPRINT[posF15];
                            break;
                        }
                        posF15++;
                    }
                }
            }
            return puntos;
        }

        function calcularPuntosF1OficialEnCarrera(driverId, round) {
            let puntos = 0;
            const carrera = carrerasCache.find(c => c.round === round);
            if (carrera && carrera.Results) {
                const res = carrera.Results.find(r => r.Driver.driverId === driverId);
                if (res) puntos += parseFloat(res.points) || 0;
            }
            const sprint = sprintsCache.find(s => s.round === round);
            if (sprint && sprint.SprintResults) {
                const res = sprint.SprintResults.find(r => r.Driver.driverId === driverId);
                if (res) puntos += parseFloat(res.points) || 0;
            }
            return puntos;
        }

        function calcularPuntosMortalConstructorEnCarrera(teamName, round) {
            let puntos = 0;
            const carrera = carrerasCache.find(c => c.round === round);
            if (carrera && carrera.Results) {
                let posF15 = 0;
                carrera.Results.forEach(res => {
                    if (!esEquipoExcluidoF15(res.Constructor.name)) {
                        if (res.Constructor.name === teamName && posF15 < PUNTOS_CARRERA.length) {
                            puntos += PUNTOS_CARRERA[posF15];
                        }
                        posF15++;
                    }
                });
            }
            const sprint = sprintsCache.find(s => s.round === round);
            if (sprint && sprint.SprintResults) {
                let posF15 = 0;
                sprint.SprintResults.forEach(res => {
                    if (!esEquipoExcluidoF15(res.Constructor.name)) {
                        if (res.Constructor.name === teamName && posF15 < PUNTOS_SPRINT.length) {
                            puntos += PUNTOS_SPRINT[posF15];
                        }
                        posF15++;
                    }
                });
            }
            return puntos;
        }

        function calcularPuntosF1OficialConstructorEnCarrera(teamName, round) {
            let puntos = 0;
            const carrera = carrerasCache.find(c => c.round === round);
            if (carrera && carrera.Results) {
                carrera.Results.forEach(res => {
                    if (res.Constructor.name === teamName) puntos += parseFloat(res.points) || 0;
                });
            }
            const sprint = sprintsCache.find(s => s.round === round);
            if (sprint && sprint.SprintResults) {
                sprint.SprintResults.forEach(res => {
                    if (res.Constructor.name === teamName) puntos += parseFloat(res.points) || 0;
                });
            }
            return puntos;
        }

        // RENDERIZADO TOTALMENTE DINÁMICO DE LAS MATRICES DETALLADAS
        function renderizarMatricesDetalladas() {
            const contenedorF15 = document.getElementById('matriz-f15-container');
            const contenedorF1 = document.getElementById('matriz-f1-container');
            
            contenedorF15.innerHTML = '';
            contenedorF1.innerHTML = '';

            if (!carrerasCache || carrerasCache.length === 0) {
                contenedorF15.innerHTML = "<p class='loading-placeholder'>No hay datos disponibles para este año.</p>";
                contenedorF1.innerHTML = "<p class='loading-placeholder'>No hay datos disponibles para este año.</p>";
                return;
            }

            let headerCircuitos = `<th class="col-fija">${modoDetalladoActual === 'pilotos' ? 'Piloto' : 'Escudería'}</th>`;
            carrerasCache.forEach(c => {
                headerCircuitos += `<th title="${c.raceName}">${obtenerAbvCircuito(c)}</th>`;
            });
            headerCircuitos += `<th>Total</th>`;

            if (modoDetalladoActual === 'pilotos') {
                // Matriz F1.5 Pilotos
                let htmlF15 = `<table class="tabla-matriz"><thead><tr>${headerCircuitos}</tr></thead><tbody>`;
                f15PilotosCache.forEach(p => {
                    htmlF15 += `<tr><td class="col-fija">${p.name}</td>`;
                    carrerasCache.forEach(c => {
                        let ptsRonda = calcularPuntosMortalEnCarrera(p.id, c.round); 
                        htmlF15 += `<td class="celda-puntos ${ptsRonda > 0 ? 'pts-alto' : 'pts-cero'}">${ptsRonda > 0 ? ptsRonda : '-'}</td>`;
                    });
                    htmlF15 += `<td style="background:rgba(225,6,0,0.15); font-weight:800;">${p.pts}</td></tr>`;
                });
                htmlF15 += "</tbody></table>";
                contenedorF15.innerHTML = htmlF15;

                // Matriz F1 Real Pilotos
                let htmlF1 = `<table class="tabla-matriz"><thead><tr>${headerCircuitos}</tr></thead><tbody>`;
                f1PilotosCache.forEach(p => {
                    const nombre = `${p.Driver.givenName} ${p.Driver.familyName}`;
                    htmlF1 += `<tr><td class="col-fija">${nombre}</td>`;
                    carrerasCache.forEach(c => {
                        let ptsRonda = calcularPuntosF1OficialEnCarrera(p.Driver.driverId, c.round);
                        htmlF1 += `<td class="celda-puntos ${ptsRonda > 0 ? 'pts-alto' : 'pts-cero'}">${ptsRonda > 0 ? ptsRonda : '-'}</td>`;
                    });
                    htmlF1 += `<td style="background:rgba(56,189,248,0.15); font-weight:800;">${p.points}</td></tr>`;
                });
                htmlF1 += "</tbody></table>";
                contenedorF1.innerHTML = htmlF1;

            } else {
                // Matriz F1.5 Constructores
                const f15Campeonato = procesarCampeonatoCompleto(carrerasCache, sprintsCache, f1PilotosCache);
                let htmlF15 = `<table class="tabla-matriz"><thead><tr>${headerCircuitos}</tr></thead><tbody>`;
                f15Campeonato.listaConst.forEach(team => {
                    htmlF15 += `<tr><td class="col-fija">${team.team}</td>`;
                    carrerasCache.forEach(c => {
                        let ptsRonda = calcularPuntosMortalConstructorEnCarrera(team.team, c.round);
                        htmlF15 += `<td class="celda-puntos ${ptsRonda > 0 ? 'pts-alto' : 'pts-cero'}">${ptsRonda > 0 ? ptsRonda : '-'}</td>`;
                    });
                    htmlF15 += `<td style="background:rgba(225,6,0,0.15); font-weight:800;">${team.pts}</td></tr>`;
                });
                htmlF15 += "</tbody></table>";
                contenedorF15.innerHTML = htmlF15;

                // Matriz F1 Real Constructores
                let htmlF1 = `<table class="tabla-matriz"><thead><tr>${headerCircuitos}</tr></thead><tbody>`;
                f1ConstCache.forEach(cTeam => {
                    htmlF1 += `<tr><td class="col-fija">${cTeam.Constructor.name}</td>`;
                    carrerasCache.forEach(c => {
                        let ptsRonda = calcularPuntosF1OficialConstructorEnCarrera(cTeam.Constructor.name, c.round);
                        htmlF1 += `<td class="celda-puntos ${ptsRonda > 0 ? 'pts-alto' : 'pts-cero'}">${ptsRonda > 0 ? ptsRonda : '-'}</td>`;
                    });
                    htmlF1 += `<td style="background:rgba(56,189,248,0.15); font-weight:800;">${cTeam.points}</td></tr>`;
                });
                htmlF1 += "</tbody></table>";
                contenedorF1.innerHTML = htmlF1;
            }
        }

        async function cambiarTemporadaHistorica(ano) {
            const infoDiv = document.getElementById('ultima-actualizacion');
            if(infoDiv) infoDiv.innerHTML = `Sincronizando registros año ${ano === 'current' ? ANIO_ACTUAL_VISIBLE : ano}...`;

            anioActual = ano;
            const urlPilotos = `https://api.jolpi.ca/ergast/f1/${ano}/driverStandings.json`;
            const urlConst = `https://api.jolpi.ca/ergast/f1/${ano}/constructorStandings.json`;
            const urlResultados = `https://api.jolpi.ca/ergast/f1/${ano}/results.json`;
            const urlSprints = `https://api.jolpi.ca/ergast/f1/${ano}/sprint.json`;

            try {
                const [resP, resC, carreras, sprints] = await Promise.all([
                    fetch(urlPilotos),
                    fetch(urlConst),
                    obtenerCarrerasPaginadas(urlResultados, 'Results'),
                    obtenerCarrerasPaginadas(urlSprints, 'SprintResults')
                ]);

                const dPilotos = await resP.json();
                const dConst = await resC.json();

                carrerasCache = carreras;
                sprintsCache = sprints;

                f1PilotosCache = dPilotos.MRData.StandingsTable.StandingsLists[0]?.DriverStandings || [];
                f1ConstCache = dConst.MRData.StandingsTable.StandingsLists[0]?.ConstructorStandings || [];

                const f15Calculado = procesarCampeonatoCompleto(carrerasCache, sprintsCache, f1PilotosCache);
                f15PilotosCache = f15Calculado.listaPilotos;

                renderizarTablasDashboard(f1PilotosCache, f15PilotosCache, f1ConstCache, f15Calculado.listaConst);
                
                const tituloSidebar = document.querySelector('#sidebar-carreras h3');
                if(tituloSidebar) tituloSidebar.innerText = ` Calendario ${ano === 'current' ? ANIO_ACTUAL_VISIBLE : ano}`;

                generarMenuCarreras(carrerasCache, sprintsCache);
                generarTablaCronica(carrerasCache, sprintsCache);

                if(infoDiv) {
                    infoDiv.innerHTML = ` Sincronizado: Historial (${ano === 'current' ? ANIO_ACTUAL_VISIBLE : ano}) Activo`;
                    infoDiv.className = "info-actualizacion estado-ok";
                }
                
                if(document.getElementById('apartado-detallado').style.display === 'flex') {
                    renderizarMatricesDetalladas();
                }
            } catch (err) {
                console.error(err);
                if(infoDiv) infoDiv.innerHTML = `Error al extraer datos del año ${ano}`;if(infoDiv) infoDiv.innerHTML = `Error al extraer datos del año ${ano}`;
            }
        }

        function procesarCampeonatoCompleto(carreras, sprints, f1Pilotos) {
            let pilotosMap = {};
            let constMap = {};

            const aplicarPuntos = (resultados, sistemaPuntos) => {
                let posF15 = 0;
                resultados.forEach(res => {
                    const escuderia = res.Constructor.name;
                    if (!esEquipoExcluidoF15(escuderia)) {
                        const idPiloto = res.Driver.driverId;
                        const nombrePiloto = `${res.Driver.givenName} ${res.Driver.familyName}`;
                        
                        if (!pilotosMap[idPiloto]) {
                            pilotosMap[idPiloto] = { 
                                id: idPiloto, name: nombrePiloto, team: escuderia, 
                                pts: 0, victorias: 0, podios: 0, nationality: res.Driver.nationality,
                                code: res.Driver.code || idPiloto.substring(0,3).toUpperCase()
                            };
                        }
                        if (!constMap[escuderia]) {
                            constMap[escuderia] = { team: escuderia, pts: 0, victorias: 0, podios: 0 };
                        }

                        if (posF15 < sistemaPuntos.length) {
                            const ptsAsignados = sistemaPuntos[posF15];
                            pilotosMap[idPiloto].pts += ptsAsignados;
                            constMap[escuderia].pts += ptsAsignados;

                            if (sistemaPuntos === PUNTOS_CARRERA) {
                                if (posF15 === 0) { pilotosMap[idPiloto].victorias += 1; constMap[escuderia].victorias += 1; }
                                if (posF15 < 3) { pilotosMap[idPiloto].podios += 1; constMap[escuderia].podios += 1; }
                            }
                        }
                        posF15++;
                    }
                });
            };

            carreras.forEach(c => aplicarPuntos(c.Results || [], PUNTOS_CARRERA));
            sprints.forEach(s => { if(s.SprintResults) aplicarPuntos(s.SprintResults, PUNTOS_SPRINT); });

            const ordenarCriterio = (a, b) => {
                if (b.pts !== a.pts) return b.pts - a.pts; 
                if (b.victorias !== a.victorias) return b.victorias - a.victorias; 
                if (b.podios !== a.podios) return b.podios - a.podios;
                return a.name.localeCompare(b.name);
            };

            return {
                listaPilotos: Object.values(pilotosMap).sort(ordenarCriterio),
                listaConst: Object.values(constMap).sort((a,b) => b.pts - a.pts)
            };
        }

        // ─── FUNCIÓN CENTRALIZADA DE FOTO (local → Wikipedia → placeholder) ───
        const PLACEHOLDER_FOTO = 'https://www.formula1.com/content/dam/fom-website/drivers/S/SUNDRIV01.png';

        function cargarFotoPiloto(imgEl, driverId, wikiUrl) {
            imgEl.onerror = null;

            const irAWikipedia = () => {
                imgEl.onerror = null;
                if (!wikiUrl) { imgEl.src = PLACEHOLDER_FOTO; return; }
                const titulo = decodeURIComponent((wikiUrl.split('/wiki/')[1] || '').split('#')[0]);
                fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(titulo)}&prop=pageimages&format=json&pithumbsize=400&origin=*`)
                    .then(r => r.json())
                    .then(d => {
                        const page = Object.values(d?.query?.pages || {})[0];
                        const thumb = page?.thumbnail?.source;
                        if (thumb) {
                            imgEl.onerror = () => { imgEl.onerror = null; imgEl.src = PLACEHOLDER_FOTO; };
                            imgEl.src = thumb;
                        } else {
                            imgEl.src = PLACEHOLDER_FOTO;
                        }
                    })
                    .catch(() => { imgEl.src = PLACEHOLDER_FOTO; });
            };

            // Usar fetch para verificar si el archivo local existe antes de asignarlo
            // Esto evita el problema de caché de errores del browser
            fetch(`pilotos/${driverId}.png`, { method: 'HEAD' })
                .then(r => {
                    if (r.ok) {
                        imgEl.onerror = irAWikipedia;
                        imgEl.src = `pilotos/${driverId}.png`;
                    } else {
                        irAWikipedia();
                    }
                })
                .catch(() => irAWikipedia());
        }

        // CONTROLADOR COMPLETO PERFIL PILOTO ESTILO ESPN
        // Genera URL de foto automática desde F1.com usando el código del piloto
        function generarUrlFotoPiloto(driverId, codigoPiloto) {
            // F1.com usa el código en mayúsculas + primeras 2 letras del apellido
            const code = (codigoPiloto || driverId.substring(0,3)).toUpperCase();
            return `https://www.formula1.com/content/dam/fom-website/drivers/${code[0]}/${code}01_${driverId.charAt(0).toUpperCase()}${driverId.slice(1)}_${driverId.charAt(0).toUpperCase()}${driverId.slice(1)}/driver-${driverId}.png.transform/2col/image.png`;
        }

        // Cache global de datos de pilotos históricos para el modal
        // pilotosDatosCache unificado con perfilDatosTemporadaCache

        async function verPerfilPiloto(driverId, anioContexto) {
            // Buscar en cache global primero, luego en la temporada actual
            let pF1 = f1PilotosCache.find(p => p.Driver.driverId === driverId);
            let pF15 = f15PilotosCache.find(p => p.id === driverId);
            let carrerasCtx = carrerasCache;
            let sprintsCtx = sprintsCache;
            let f15Ctx = f15PilotosCache;
            let anoSelector = anioActual;

            // Si el piloto no está en la temporada actual, cargar desde el año de contexto
            if (!pF1 && anioContexto) {
                const clave = String(anioContexto);
                if (!perfilDatosTemporadaCache[clave]) {
                    try {
                        await obtenerDatosTemporadaPerfil(clave);
                    } catch(e) { console.error(e); }
                }
                const datos = perfilDatosTemporadaCache[clave];
                if (datos) {
                    pF1 = datos.f1Pilotos.find(p => p.Driver.driverId === driverId);
                    pF15 = datos.f15Pilotos.find(p => p.id === driverId);
                    carrerasCtx = datos.carreras;
                    sprintsCtx = datos.sprints;
                    f15Ctx = datos.f15Pilotos;
                    anoSelector = clave;
                }
            }

            if (!pF1) return;

            // Guardar el piloto actual globalmente
            pilotoPerfilActual = driverId;

            // Poblar y sincronizar el selector de temporadas del modal
            inicializarSelectorPerfilPiloto();
            const selectorPerfil = document.getElementById('selector-ano-perfil');
            if (selectorPerfil) selectorPerfil.value = anoSelector;

            document.getElementById('espn-nombre').innerText = `${pF1.Driver.givenName} ${pF1.Driver.familyName}`;
            const escuderia = pF1.Constructors[0]?.name || "Sin Equipo";
            const numero = pF1.Driver.permanentNumber ? `#${pF1.Driver.permanentNumber}` : "#--";
            document.getElementById('espn-meta-info').innerText = `${numero} | ${escuderia} | ${pF1.Driver.nationality}`;

            // Datos F1 Oficial
            document.getElementById('espn-f1-pos').innerText = pF1.position;
            document.getElementById('espn-f1-pts').innerText = pF1.points;
            const liderPts = (anioContexto ? (perfilDatosTemporadaCache[String(anioContexto)]?.f1Pilotos?.[0]?.points) : f1PilotosCache[0]?.points) || 0;
            const gap = pF1.position === "1" ? "Líder" : `${(liderPts - pF1.points).toFixed(0)}`;
            document.getElementById('espn-f1-gap').innerText = gap;

            // Datos F1.5
            if (pF15) {
                const posF15 = f15Ctx.findIndex(p => p.id === driverId) + 1;
                document.getElementById('espn-f15-partidas').innerText = posF15 > 0 ? posF15 : '-';
                document.getElementById('espn-f15-victorias').innerText = pF15.victorias;
                document.getElementById('espn-f15-podios').innerText = pF15.podios;
            } else {
                document.getElementById('espn-f15-partidas').innerText = "-";
                document.getElementById('espn-f15-victorias').innerText = "-";
                document.getElementById('espn-f15-podios').innerText = "-";
            }

            // Foto: primero carpeta local /pilotos/, si falla → Wikipedia, si falla → placeholder
            cargarFotoPiloto(document.getElementById('espn-foto'), driverId, pF1.Driver.url);

            document.getElementById('modal-piloto').style.display = 'flex';
            renderizarPanelesPerfilPilotoConDatos(driverId, pF1, pF15, carrerasCtx, sprintsCtx, f15Ctx);
            cambiarTabPerfil('perfil');
        }

        function cambiarTabPerfil(tabId, elemento) {
            document.querySelectorAll('.espn-panel').forEach(panel => panel.classList.remove('active'));
            document.getElementById(`espn-panel-${tabId}`).classList.add('active');

            document.querySelectorAll('.espn-tab-item').forEach(tab => tab.classList.remove('active'));
            if (elemento) {
                elemento.classList.add('active');
            } else {
                const tabs = { perfil: 0, estadisticas: 1, resultados: 2 };
                document.querySelectorAll('.espn-tab-item')[tabs[tabId]]?.classList.add('active');
            }
        }

        function generarTablaCronica(carreras, sprints) {
            const cronicaBody = document.getElementById('tabla-cronica-ganadores-body');
            let htmlCronica = '';

            carreras.forEach(carrera => {
                let ganadorDomingo = "Sin clasificar";
                const primerMortalDomingo = (carrera.Results || []).find(res => !esEquipoExcluidoF15(res.Constructor.name));
                if (primerMortalDomingo) {
                    const flag = generarBanderaImg(primerMortalDomingo.Driver.nationality);
                    ganadorDomingo = `${flag} <strong>${primerMortalDomingo.Driver.givenName} ${primerMortalDomingo.Driver.familyName}</strong> <span style="font-size:0.75rem; color:#6b7280">(${primerMortalDomingo.Constructor.name})</span>`;
                }

                let ganadorSprint = `<span style="color:#4b5563">-</span>`;
                const sprintData = sprints.find(s => s.round === carrera.round && s.SprintResults);
                if (sprintData) {
                    const primerMortalSprint = sprintData.SprintResults.find(res => !esEquipoExcluidoF15(res.Constructor.name));
                    if (primerMortalSprint) {
                        const flagSprint = generarBanderaImg(primerMortalSprint.Driver.nationality);
                        ganadorSprint = `${flagSprint} <strong>${primerMortalSprint.Driver.givenName} ${primerMortalSprint.Driver.familyName}</strong> <span style="font-size:0.75rem; color:#6b7280">(${primerMortalSprint.Constructor.name})</span>`;
                    }
                }

                htmlCronica += `<tr>
                    <td><strong>GP ${carrera.raceName}</strong><br><span style="font-size:0.75rem; color:#4b5563">Ronda ${carrera.round}</span></td>
                    <td> ${ganadorDomingo}</td>
                    <td> ${ganadorSprint}</td>
                </tr>`;
            });
            cronicaBody.innerHTML = htmlCronica;
        }

        // RE-DISEÑO DEL MENÚ IZQUIERDO RECORRIENDO DE FORMA DINÁMICA EL 100% DEL CALENDARIO
        function generarMenuCarreras(carreras, sprints) {
            const listaUl = document.getElementById('lista-carreras');
            const panelDetalle = document.getElementById('detalle-carrera-panel');
            listaUl.innerHTML = '';
            if (panelDetalle) panelDetalle.style.display = 'none';

            carreras.forEach((carrera, index) => {
                const liCarrera = document.createElement('li');
                liCarrera.className = 'item-carrera';
                liCarrera.innerHTML = `R${carrera.round} - ${carrera.raceName}`;
                liCarrera.onclick = () => verDetalleSesion(index, 'carrera', liCarrera);
                listaUl.appendChild(liCarrera);

                const tieneSprint = sprints.find(s => s.round === carrera.round && s.SprintResults);
                if (tieneSprint) {
                    const liSprint = document.createElement('li');
                    liSprint.className = 'item-carrera';
                    liSprint.style.paddingLeft = '22px';
                    liSprint.innerHTML = `↳ Sprint <span class="badge-sprint">Sprint</span>`;
                    liSprint.onclick = () => verDetalleSesion(index, 'sprint', liSprint);
                    listaUl.appendChild(liSprint);
                }
            });
        }

        function verDetalleSesion(indexCarrera, tipo) {
            const carrera = carrerasCache[indexCarrera];
            const tituloModal = document.getElementById('modal-titulo');
            const subModal = document.getElementById('modal-subtitulo');
            const tablaF1 = document.getElementById('modal-tabla-f1');
            const tablaF15 = document.getElementById('modal-tabla-f15');

            let resultadosBrutos = [];
            let sistemaPuntos = [];

            if (tipo === 'carrera') {
                tituloModal.innerText = carrera.raceName;
                subModal.innerText = `Resultados de la Carrera Principal`;
                resultadosBrutos = carrera.Results || [];
                sistemaPuntos = PUNTOS_CARRERA;
            } else {
                const sprintData = sprintsCache.find(s => s.round === carrera.round);
                tituloModal.innerText = `${carrera.raceName} (Sprint)`;
                subModal.innerText = `Resultados de la sesión Sprint corta`;
                resultadosBrutos = sprintData ? (sprintData.SprintResults || []) : [];
                sistemaPuntos = PUNTOS_SPRINT;
            }

            let htmlF1 = '';
            let htmlF15 = '';
            let posF15 = 1;

            resultadosBrutos.forEach(res => {
                const nombre = `${res.Driver.givenName} ${res.Driver.familyName}`;
                const escuderia = res.Constructor.name;
                const flag = generarBanderaImg(res.Driver.nationality);

                htmlF1 += `<tr><td class="pos">${res.position}</td><td><div class="piloto-nombre-contenedor">${flag}<span><strong>${nombre}</strong><br><span style="font-size:0.7rem; color:#4b5563">${escuderia}</span></span></div></td><td class="pts">${res.points}</td></tr>`;

                if (!esEquipoExcluidoF15(escuderia)) {
                    const ptsF15 = posF15 <= sistemaPuntos.length ? sistemaPuntos[posF15 - 1] : 0;
                    htmlF15 += `<tr><td class="pos">${posF15}</td><td><div class="piloto-nombre-contenedor">${flag}<span><strong>${nombre}</strong><br><span style="font-size:0.7rem; color:#4b5563">${escuderia}</span></span></div></td><td class="pts">${ptsF15}</td></tr>`;
                    posF15++;
                }
            });

            tablaF1.innerHTML = htmlF1;
            tablaF15.innerHTML = htmlF15;
            document.getElementById('modal-carrera').style.display = 'flex';
        }

        function verDetalleSesion(indexCarrera, tipo, elementoSeleccionado) {
            const carrera = carrerasCache[indexCarrera];
            const panel = document.getElementById('detalle-carrera-panel');
            const body = document.getElementById('detalle-carrera-body');

            let resultadosBrutos = [];
            let sistemaPuntos = [];
            let titulo = carrera.raceName;
            let tipoSesion = "Carrera principal";

            if (tipo === 'carrera') {
                resultadosBrutos = carrera.Results || [];
                sistemaPuntos = PUNTOS_CARRERA;
            } else {
                const sprintData = sprintsCache.find(s => s.round === carrera.round);
                titulo = `${carrera.raceName} (Sprint)`;
                tipoSesion = "Sprint";
                resultadosBrutos = sprintData ? (sprintData.SprintResults || []) : [];
                sistemaPuntos = PUNTOS_SPRINT;
            }

            let htmlF1 = '';
            let htmlF15 = '';
            let posF15 = 1;
            let ganadorF1 = resultadosBrutos[0];
            let ganadorF15 = null;
            let mejorVuelta = resultadosBrutos.find(res => res.FastestLap?.rank === "1") || resultadosBrutos.find(res => res.FastestLap?.Time?.time);
            let vueltas = resultadosBrutos[0]?.laps || "-";
            let topVueltas = [...resultadosBrutos]
                .filter(res => res.FastestLap?.Time?.time)
                .sort((a, b) => Number(a.FastestLap.rank || 99) - Number(b.FastestLap.rank || 99))
                .slice(0, 5);

            resultadosBrutos.forEach(res => {
                const nombre = `${res.Driver.givenName} ${res.Driver.familyName}`;
                const escuderia = res.Constructor.name;
                const flag = generarBanderaImg(res.Driver.nationality);
                const vueltaRapida = res.FastestLap?.Time?.time ? `<br><span style="font-size:0.7rem; color:#6b7280">VR ${res.FastestLap.Time.time}</span>` : '';

                htmlF1 += `<tr><td class="pos">${res.position}</td><td><div class="piloto-nombre-contenedor">${flag}<span><strong>${nombre}</strong><br><span style="font-size:0.7rem; color:#4b5563">${escuderia}</span>${vueltaRapida}</span></div></td><td>${res.laps || '-'}</td><td class="pts">${res.points}</td></tr>`;

                if (!esEquipoExcluidoF15(escuderia)) {
                    if (!ganadorF15) ganadorF15 = res;
                    const ptsF15 = posF15 <= sistemaPuntos.length ? sistemaPuntos[posF15 - 1] : 0;
                    htmlF15 += `<tr><td class="pos">${posF15}</td><td><div class="piloto-nombre-contenedor">${flag}<span><strong>${nombre}</strong><br><span style="font-size:0.7rem; color:#4b5563">${escuderia}</span>${vueltaRapida}</span></div></td><td>${res.laps || '-'}</td><td class="pts">${ptsF15}</td></tr>`;
                    posF15++;
                }
            });

            const nombreGanadorF1 = ganadorF1 ? `${ganadorF1.Driver.givenName} ${ganadorF1.Driver.familyName}` : "-";
            const nombreGanadorF15 = ganadorF15 ? `${ganadorF15.Driver.givenName} ${ganadorF15.Driver.familyName}` : "-";
            const mejorVueltaTxt = mejorVuelta?.FastestLap?.Time?.time
                ? `${mejorVuelta.FastestLap.Time.time} - ${mejorVuelta.Driver.givenName} ${mejorVuelta.Driver.familyName}`
                : "-";
            const promedioMejorVuelta = mejorVuelta?.FastestLap?.AverageSpeed?.speed
                ? `${mejorVuelta.FastestLap.AverageSpeed.speed} ${mejorVuelta.FastestLap.AverageSpeed.units || 'kph'}`
                : "-";
            const fecha = carrera.date ? new Date(`${carrera.date}T${carrera.time || '00:00:00Z'}`).toLocaleDateString('es-AR') : "-";
            const subtitulo = `${carrera.Circuit?.circuitName || 'Circuito'} - ${carrera.Circuit?.Location?.locality || ''}, ${carrera.Circuit?.Location?.country || ''}`;
            const htmlTopVueltas = topVueltas.length ? topVueltas.map(res => `
                <tr>
                    <td>${res.FastestLap.rank || '-'}</td>
                    <td>${generarBanderaImg(res.Driver.nationality)} <strong>${res.Driver.givenName} ${res.Driver.familyName}</strong></td>
                    <td>${res.FastestLap.lap || '-'}</td>
                    <td class="pts">${res.FastestLap.Time.time}</td>
                </tr>
            `).join('') : `<tr><td colspan="4" class="loading-placeholder">Sin datos de vueltas rapidas para esta sesion.</td></tr>`;

            body.innerHTML = `
                <div class="detalle-carrera-header">
                    <div>
                        <h2>${titulo}</h2>
                        <div class="detalle-carrera-subtitulo">${subtitulo}</div>
                    </div>
                    <div class="detalle-carrera-badge">${tipoSesion}</div>
                </div>

                <div class="detalle-carrera-grid">
                    <div class="detalle-dato"><span>Fecha</span><strong>${fecha}</strong></div>
                    <div class="detalle-dato"><span>Vueltas</span><strong>${vueltas}</strong></div>
                    <div class="detalle-dato"><span>Ganador F1</span><strong>${nombreGanadorF1}</strong></div>
                    <div class="detalle-dato"><span>Ganador F1.5</span><strong>${nombreGanadorF15}</strong></div>
                    <div class="detalle-dato"><span>Mejor vuelta</span><strong>${mejorVueltaTxt}</strong></div>
                    <div class="detalle-dato"><span>Velocidad media</span><strong>${promedioMejorVuelta}</strong></div>
                    <div class="detalle-dato"><span>Circuito</span><strong>${carrera.Circuit?.circuitName || '-'}</strong></div>
                    <div class="detalle-dato"><span>Pais</span><strong>${carrera.Circuit?.Location?.country || '-'}</strong></div>
                </div>

                <div class="detalle-tablas-grid">
                    <div>
                        <h3>F1 Oficial</h3>
                        <table><thead><tr><th class="pos">Pos</th><th>Piloto</th><th>Vueltas</th><th class="pts">Pts</th></tr></thead><tbody>${htmlF1}</tbody></table>
                    </div>
                    <div>
                        <h3>F1.5 Mortales</h3>
                        <table><thead><tr><th class="pos">Pos</th><th>Piloto</th><th>Vueltas</th><th class="pts">Pts</th></tr></thead><tbody>${htmlF15}</tbody></table>
                    </div>
                </div>

                <div style="margin-top:18px;">
                    <h3 style="color:#38bdf8; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.5px; margin:0 0 10px;">Top vueltas rapidas</h3>
                    <table><thead><tr><th>Rank</th><th>Piloto</th><th>Vuelta</th><th class="pts">Tiempo</th></tr></thead><tbody>${htmlTopVueltas}</tbody></table>
                </div>
            `;

            document.querySelectorAll('.item-carrera').forEach(item => item.classList.remove('active'));
            if (elementoSeleccionado) elementoSeleccionado.classList.add('active');
            panel.style.display = 'block';
            panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function renderizarTablasDashboard(f1Pilotos, f15Pilotos, f1Const, f15Const) {
            f1PilotosCache = f1Pilotos;
            f15PilotosCache = f15Pilotos;
            f1ConstCache = f1Const;

            let htmlF1Pilotos = '';
            f1Pilotos.forEach(p => {
                const flag = generarBanderaImg(p.Driver.nationality);
                htmlF1Pilotos += `<tr style="cursor:pointer;" onclick="verPerfilPiloto('${p.Driver.driverId}')">
                    <td class="pos">${p.position}</td>
                    <td><div class="piloto-nombre-contenedor">${flag}<strong>${p.Driver.givenName} ${p.Driver.familyName}</strong></div></td>
                    <td style="color:#6b7280">${p.Constructors[0]?.name || "Sin Equipo"}</td>
                    <td class="pts">${p.points}</td>
                </tr>`;
            });
            document.getElementById('tabla-f1-pilotos').innerHTML = htmlF1Pilotos;

            let htmlF15Pilotos = '';
            let ptsLiderPilotos = f15Pilotos[0]?.pts || 0;
            f15Pilotos.forEach((p, index) => {
                const pos = index + 1;
                const gap = pos === 1 ? "Líder" : `${ptsLiderPilotos - p.pts}`;
                const flag = generarBanderaImg(p.nationality);
                htmlF15Pilotos += `<tr style="cursor:pointer;" onclick="verPerfilPiloto('${p.id}')">
                    <td class="pos">${pos}</td>
                    <td><div class="piloto-nombre-contenedor">${flag}<strong>${p.name}</strong></div></td>
                    <td style="color:#6b7280">${p.team}</td>
                    <td class="gap">${gap}</td>
                    <td class="pts">${p.pts}</td>
                </tr>`;
            });
            document.getElementById('tabla-f15-pilotos').innerHTML = htmlF15Pilotos;

            if (f15Pilotos[0]) {
                const widget = document.getElementById('widget-lider');
                const flagLider = generarBanderaImg(f15Pilotos[0].nationality);
                widget.innerHTML = `<h3>Líder Absoluto F1.5</h3><div class="lider-nombre">${flagLider} ${f15Pilotos[0].name}</div><div style="font-size:0.75rem; color:#6b7280; margin-top:2px">${f15Pilotos[0].team}</div><div class="lider-pts">${f15Pilotos[0].pts} PTS</div>`;
                widget.style.display = 'block';
            }

            if (f15Pilotos.length > 0) {
                const masVictorias = [...f15Pilotos].sort((a,b) => b.victorias - a.victorias)[0];
                const masPodios = [...f15Pilotos].sort((a,b) => b.podios - a.podios)[0];
                
                document.getElementById('mini-stats-body').innerHTML = `
                    <div class="stat-col"> Más Victorias<strong>${masVictorias.name}</strong><span>${masVictorias.victorias}</span></div>
                    <div class="stat-col"> Más Podios<strong>${masPodios.name}</strong><span>${masPodios.podios}</span></div>
                `;
                document.getElementById('widget-stats').style.display = 'block';
            }

            let htmlF1Const = '';
            f1Const.forEach(c => {
                htmlF1Const += `<tr><td class="pos">${c.position}</td><td><strong>${c.Constructor.name}</strong></td><td class="pts">${c.points}</td></tr>`;
            });
            document.getElementById('tabla-f1-constructores').innerHTML = htmlF1Const;

            let htmlF15Const = '';
            let ptsLiderConst = f15Const[0]?.pts || 0;
            f15Const.forEach((c, index) => {
                const pos = index + 1;
                const gap = pos === 1 ? "Líder" : `${ptsLiderConst - c.pts}`;
                htmlF15Const += `<tr><td class="pos">${pos}</td><td><strong>${c.team}</strong></td><td class="gap">${gap}</td><td class="pts">${c.pts}</td></tr>`;
            });
            document.getElementById('tabla-f15-constructores').innerHTML = htmlF15Const;
        }

        async function administrarVisitas() {
            const contadorUrl = 'https://api.counterapi.dev/v1/f15campeonato2026/visitas';
            const claveVisita = 'f15-visita-contabilizada';
            const claveConteo = 'f15-visitas-total-v2';

            try {
                const leerMarcaVisita = () => {
                    try {
                        if (window.localStorage?.getItem(claveVisita) === 'true') return true;
                    } catch {}

                    return document.cookie.split('; ').includes(`${claveVisita}=true`);
                };

                const guardarMarcaVisita = () => {
                    try { window.localStorage?.setItem(claveVisita, 'true'); } catch {}
                    document.cookie = `${claveVisita}=true; max-age=31536000; path=/; SameSite=Lax`;
                };

                const leerConteoGuardado = () => {
                    try { return window.localStorage?.getItem(claveConteo); } catch { return null; }
                };

                const guardarConteo = (conteo) => {
                    try { window.localStorage?.setItem(claveConteo, conteo); } catch {}
                };

                const yaConto = leerMarcaVisita();
                const conteoGuardado = leerConteoGuardado();

                if (yaConto) {
                    try {
                        const res = await fetch(contadorUrl);
                        const data = await res.json();
                        guardarConteo(data.count);
                        document.getElementById('cantidad-visitas').innerText = data.count;
                        return;
                    } catch {
                        document.getElementById('cantidad-visitas').innerText = conteoGuardado || '1';
                        return;
                    }
                }

                const res = await fetch(`${contadorUrl}/up`);
                const data = await res.json();

                if (!yaConto) guardarMarcaVisita();
                guardarConteo(data.count);
                document.getElementById('cantidad-visitas').innerText = data.count;
            } catch { document.getElementById('contador').style.display = 'none'; }
        }

        // --- LÓGICA DE TELEMETRÍA EN VIVO (OPENF1 API) ---
        // ── HELPERS EN VIVO ──

        function enfocarPilotoVivo(numero, nombre, equipo) {
            pilotoVivoEnfocado = { numero, nombre };
            document.getElementById('telemetry-focus').style.display = 'block';
            document.getElementById('tele-driver-name').innerText = nombre.toUpperCase();
            document.getElementById('tele-driver-team').innerText = equipo || '';
        }

        function formatearTiempo(segundos) {
            if (!segundos || segundos <= 0) return '--:--.---';
            const mins = Math.floor(segundos / 60);
            const secs = (segundos % 60).toFixed(3);
            return `${mins}:${secs.padStart(6, '0')}`;
        }

        function obtenerColorStatus(status) {
            if (status === 2051) return '#a855f7';
            if (status === 2049) return '#10b981';
            if (status === 2050) return '#f59e0b';
            return '#374151';
        }

        function obtMejorStatus(segmentos) {
            if (!segmentos || !segmentos.length) return 2048;
            if (segmentos.includes(2051)) return 2051;
            if (segmentos.includes(2049)) return 2049;
            if (segmentos.includes(2050)) return 2050;
            return 2048;
        }

        function generarMicroSectores(segmentos) {
            if (!segmentos || !segmentos.length) return '';
            return segmentos.map(s => `<div class="micro-seg" style="background:${obtenerColorStatus(s)}"></div>`).join('');
        }

        function getTeamColor(team) {
            if (!team) return '#ffffff';
            const colors = {
                'Red Bull': '#3671C6', 'Mercedes': '#27F4D2', 'Ferrari': '#E80020',
                'McLaren': '#FF8000', 'Aston Martin': '#229971', 'Alpine': '#0093CC',
                'Williams': '#64C4FF', 'RB': '#6692FF', 'Haas': '#B6BABD', 'Sauber': '#52E252'
            };
            for (let key in colors) if (team.includes(key)) return colors[key];
            return '#ffffff';
        }

        function escapeAttr(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }

        function getTeamLogoPath(team) {
            if (!team) return null;
            const logos = {
                'Red Bull': 'red-bull-racing.svg',
                'Mercedes': 'mercedes.svg',
                'Ferrari': 'ferrari.svg',
                'McLaren': 'mclaren.svg',
                'Aston Martin': 'aston-martin.svg',
                'Alpine': 'alpine.svg',
                'Williams': 'williams.svg',
                'Racing Bulls': 'racing-bulls.svg',
                'RB': 'racing-bulls.svg',
                'Haas': 'haas-f1-team.svg',
                'Sauber': 'kick-sauber.svg',
                'Kick Sauber': 'kick-sauber.svg'
            };
            const match = Object.keys(logos).find(key => team.includes(key));
            return match ? `assets/team-logos/${logos[match]}` : null;
        }

        function htmlPilotoLive(driver, teamColor) {
            const teamName = driver.team_name || '—';
            const logoPath = getTeamLogoPath(teamName);
            const logo = logoPath
                ? `<img class="ltt-team-logo" src="${logoPath}" alt="${escapeAttr(teamName)} logo" loading="lazy">`
                : '';
            return `
                <div class="ltt-driver-cell">
                    <span class="ltt-team-stripe" style="background:${teamColor};"></span>
                    ${logo}
                    <div>
                        <div class="ltt-driver">${driver.name_acronym || driver.broadcast_name || '—'}</div>
                        <div class="ltt-team">${teamName}</div>
                    </div>
                </div>`;
        }

        function tipoNeumatico(compound) {
            const map = { SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTERMEDIATE: 'I', WET: 'W' };
            return map[String(compound || '').toUpperCase()] || '?';
        }

        function htmlNeumatico(compound, age) {
            const letra = tipoNeumatico(compound);
            const compoundKey = String(compound || 'UNKNOWN').toUpperCase();
            const fileMap = {
                SOFT: 'soft.svg',
                MEDIUM: 'medium.svg',
                HARD: 'hard.svg',
                INTERMEDIATE: 'intermediate.svg',
                WET: 'wet.svg',
                UNKNOWN: 'unknown.svg'
            };
            const fileName = fileMap[compoundKey] || fileMap.UNKNOWN;
            return `<div class="tire-chip" title="${escapeAttr(compound || 'Desconocido')}">
                <img class="tire-icon" src="assets/tires/${fileName}" alt="${escapeAttr(compound || 'unknown')}">
                <span class="tire-badge tire-${compoundKey}">${letra}</span>
                <span class="tire-age">${age != null ? `+${age}v` : ''}</span>
            </div>`;
        }

        function formatearGap(gap) {
            if (gap == null || gap === '') return '—';
            if (typeof gap === 'string' && gap.includes('LAP')) return gap;
            const n = parseFloat(gap);
            if (isNaN(n)) return gap;
            return `+${n.toFixed(3)}`;
        }

        function cambiarModoLive(modo) {
            modoLiveActual = modo;
            document.getElementById('btn-live-f1').classList.toggle('active', modo === 'f1');
            document.getElementById('btn-live-f15').classList.toggle('active', modo === 'f15');
            document.getElementById('container-live-f1').style.display = modo === 'f1' ? 'block' : 'none';
            document.getElementById('container-live-f15').style.display = modo === 'f15' ? 'block' : 'none';
            const title = document.getElementById('timing-table-title');
            if (title) title.innerText = modo === 'f1' ? 'Live Timing — F1 Oficial' : 'Live Timing — F1.5 Mortales';
        }

        async function toggleModoDemo() {
            modoDemoLive = !modoDemoLive;
            // Reset total del estado
            liveUpdateVersion++;
            if (intervalLive) { clearInterval(intervalLive); intervalLive = null; }
            liveSessionCache = null;
            liveDriversCache = null;
            isUpdatingLive = false;
            trackBounds = null;
            // Limpiar SVG del mapa
            const svg = document.getElementById('track-svg');
            if (svg) svg.innerHTML = '';

            // Feedback de carga
            const placeholder = '<tr><td colspan="8" class="loading-placeholder">Sincronizando telemetría...</td></tr>';
            document.getElementById('live-timing-body').innerHTML = placeholder;
            document.getElementById('live-timing-official-body').innerHTML = placeholder;
            document.getElementById('pit-stops-body').innerHTML = '<div class="loading-placeholder" style="padding:20px;">Cargando...</div>';
            document.getElementById('race-control-body').innerHTML = '<div class="loading-placeholder" style="padding:20px;">Cargando...</div>';
            document.getElementById('team-radio-body').innerHTML = '<div class="loading-placeholder" style="padding:20px;">Cargando...</div>';

            const btn = document.getElementById('btn-demo');
            if (modoDemoLive) {
                btn.innerText = 'MODO DEMO: ON';
                btn.style.background = 'rgba(245,158,11,0.12)';
                btn.style.borderColor = 'rgba(245,158,11,0.4)';
                btn.style.color = '#f59e0b';
            } else {
                btn.innerText = 'MODO DEMO: OFF';
                btn.style.background = 'rgba(255,255,255,0.05)';
                btn.style.borderColor = 'rgba(255,255,255,0.1)';
                btn.style.color = '#9ca3af';
            }

            await actualizarTimingEnVivo();
            if (!modoDemoLive && !intervalLive) {
                intervalLive = setInterval(actualizarTimingEnVivo, 8000);
            }
        }

        async function iniciarLiveUpdates() {
            if (intervalLive) { clearInterval(intervalLive); intervalLive = null; }
            await actualizarTimingEnVivo();
            if (!modoDemoLive) {
                intervalLive = setInterval(actualizarTimingEnVivo, 8000);
            }
        }

        async function actualizarTimingEnVivo() {
            if (isUpdatingLive) return;
            isUpdatingLive = true;
            const updateVersion = ++liveUpdateVersion;
            const isCurrentUpdate = () => updateVersion === liveUpdateVersion;

            const statusDiv = document.getElementById('session-info');
            const typeTag = document.getElementById('session-type-tag');

            const fetchJson = async (url, timeout = 10000) => {
                try {
                    const r = await fetch(url, { signal: AbortSignal.timeout(timeout) });
                    if (!r.ok) return [];
                    return await r.json();
                } catch { return []; }
            };

            try {
                // ── 1. OBTENER SESSION KEY ──
                let sessionKey;
                if (modoDemoLive) {
                    sessionKey = SESSION_ID_DEMO;
                } else {
                    const sessions = await fetchJson('https://api.openf1.org/v1/sessions?session_key=latest', 6000);
                    if (!isCurrentUpdate()) return;
                    if (!sessions || !sessions.length) {
                        statusDiv.innerText = 'Sin sesión activa — activá el Modo Demo';
                        if (typeTag) typeTag.innerText = 'No hay GP en curso';
                        const noSession = '<tr><td colspan="8" class="loading-placeholder" style="padding:30px;">No hay sesión activa en este momento. Activá el Modo Demo para ver datos de ejemplo.</td></tr>';
                        document.getElementById('live-timing-official-body').innerHTML = noSession;
                        document.getElementById('live-timing-body').innerHTML = noSession;
                        isUpdatingLive = false;
                        return;
                    }
                    sessionKey = sessions[0].session_key;
                }

                // ── 2. INFO DE SESIÓN ──
                if (!liveSessionCache || liveSessionCache.session_key != sessionKey) {
                    const sInfo = await fetchJson(`https://api.openf1.org/v1/sessions?session_key=${sessionKey}`);
                    if (!isCurrentUpdate()) return;
                    if (sInfo && sInfo.length > 0) liveSessionCache = sInfo[0];
                    liveDriversCache = null;
                    trackBounds = null;
                    const svg = document.getElementById('track-svg');
                    if (svg) svg.innerHTML = '';
                }
                if (liveSessionCache) {
                    statusDiv.innerText = `${modoDemoLive ? DEMO_SESSION_LABEL : 'LIVE | ' + liveSessionCache.location + ' ' + liveSessionCache.year}`;
                    if (typeTag) typeTag.innerText = modoDemoLive ? DEMO_SESSION_TYPE : (liveSessionCache.session_name || '');
                }

                // ── 3. PILOTOS ──
                if (!liveDriversCache) {
                    liveDriversCache = await fetchJson(`https://api.openf1.org/v1/drivers?session_key=${sessionKey}`);
                    if (!isCurrentUpdate()) return;
                }

                // ── 4. QUERIES EN VIVO / DEMO ──
                // En datos históricos algunos endpoints fallan con `limit`; en demo limitamos en memoria.
                const urlsLive = {
                    positions: `https://api.openf1.org/v1/position?session_key=${sessionKey}&limit=500`,
                    laps: `https://api.openf1.org/v1/laps?session_key=${sessionKey}&limit=300`,
                    locations: `https://api.openf1.org/v1/location?session_key=${sessionKey}&limit=300`,
                    intervals: `https://api.openf1.org/v1/intervals?session_key=${sessionKey}&limit=100`,
                    teamRadio: `https://api.openf1.org/v1/team_radio?session_key=${sessionKey}&limit=15`,
                    weather: `https://api.openf1.org/v1/weather?session_key=${sessionKey}&limit=1`
                };
                const urlsDemo = {
                    positions: `https://api.openf1.org/v1/position?session_key=${sessionKey}`,
                    laps: `https://api.openf1.org/v1/laps?session_key=${sessionKey}${DEMO_LAP_FILTER}`,
                    locations: null,
                    intervals: `https://api.openf1.org/v1/intervals?session_key=${sessionKey}`,
                    teamRadio: `https://api.openf1.org/v1/team_radio?session_key=${sessionKey}`,
                    weather: `https://api.openf1.org/v1/weather?session_key=${sessionKey}`
                };
                const liveUrls = modoDemoLive ? urlsDemo : urlsLive;

                const [
                    allPositions, allLaps, allLocations,
                    allIntervals, allStints, allPits,
                    allRaceControl, allTeamRadio, allWeather
                ] = await Promise.all([
                    liveUrls.positions ? fetchJson(liveUrls.positions) : Promise.resolve([]),
                    liveUrls.laps ? fetchJson(liveUrls.laps) : Promise.resolve([]),
                    liveUrls.locations ? fetchJson(liveUrls.locations) : Promise.resolve([]),
                    liveUrls.intervals ? fetchJson(liveUrls.intervals) : Promise.resolve([]),
                    fetchJson(`https://api.openf1.org/v1/stints?session_key=${sessionKey}`),
                    fetchJson(`https://api.openf1.org/v1/pit?session_key=${sessionKey}`),
                    fetchJson(`https://api.openf1.org/v1/race_control?session_key=${sessionKey}`),
                    liveUrls.teamRadio ? fetchJson(liveUrls.teamRadio) : Promise.resolve([]),
                    liveUrls.weather ? fetchJson(liveUrls.weather) : Promise.resolve([])
                ]);
                if (!isCurrentUpdate()) return;

                // ── 5. CLIMA ──
                if (allWeather && allWeather.length > 0) {
                    const w = allWeather[0];
                    document.getElementById('weather-widget').style.display = 'flex';
                    document.getElementById('w-air').innerText = `${w.air_temperature ?? '—'}°C`;
                    document.getElementById('w-track').innerText = `${w.track_temperature ?? '—'}°C`;
                    document.getElementById('w-hum').innerText = `${w.humidity ?? '—'}%`;
                    document.getElementById('w-wind').innerText = `${w.wind_speed ?? '—'} m/s`;
                    document.getElementById('w-rain').innerText = w.rainfall > 0 ? 'SÍ' : 'NO';
                    document.getElementById('w-pressure').innerText = `${w.pressure ?? '—'} hPa`;
                }

                // ── 6. MAPEAR DATOS ──
                const latestLapMap = new Map();
                if (allLaps) allLaps.forEach(l => {
                    if (!latestLapMap.has(l.driver_number) || l.lap_number > latestLapMap.get(l.driver_number).lap_number)
                        latestLapMap.set(l.driver_number, l);
                });

                const latestPosMap = new Map();
                if (allPositions) allPositions.forEach(p => latestPosMap.set(p.driver_number, p));

                const latestIntervalMap = new Map();
                if (allIntervals) allIntervals.forEach(i => latestIntervalMap.set(i.driver_number, i));

                // Stint actual por piloto (el de mayor stint_number)
                const stintMap = new Map();
                if (allStints) allStints.forEach(s => {
                    const cur = stintMap.get(s.driver_number);
                    if (!cur || s.stint_number > cur.stint_number) stintMap.set(s.driver_number, s);
                });

                // ── 7. MAPA DEL CIRCUITO ──
                if (allLocations && allLocations.length > 0) {
                    const svg = document.getElementById('track-svg');
                    if (!trackBounds) {
                        const xs = allLocations.map(l => l.x).filter(Boolean);
                        const ys = allLocations.map(l => l.y).filter(Boolean);
                        if (xs.length) {
                            trackBounds = {
                                minX: Math.min(...xs) - 600, maxX: Math.max(...xs) + 600,
                                minY: Math.min(...ys) - 600, maxY: Math.max(...ys) + 600
                            };
                            svg.setAttribute('viewBox', `${trackBounds.minX} ${trackBounds.minY} ${trackBounds.maxX - trackBounds.minX} ${trackBounds.maxY - trackBounds.minY}`);
                        }
                    }
                    const latestLocs = new Map();
                    allLocations.forEach(l => { if (l.x && l.y) latestLocs.set(l.driver_number, l); });
                    latestLocs.forEach((loc, drvNum) => {
                        const driver = liveDriversCache?.find(d => d.driver_number === drvNum);
                        if (!driver) return;
                        const isMortal = !esEquipoExcluidoF15(driver.team_name);
                        if (modoLiveActual === 'f15' && !isMortal) {
                            document.getElementById(`dot-${drvNum}`)?.remove(); return;
                        }
                        let dot = document.getElementById(`dot-${drvNum}`);
                        if (!dot) {
                            dot = document.createElementNS("http://www.w3.org/2000/svg", "g");
                            dot.setAttribute('id', `dot-${drvNum}`);
                            dot.setAttribute('class', 'dot-driver');
                            const color = getTeamColor(driver.team_name);
                            dot.innerHTML = `<circle r="180" fill="${color}" stroke="white" stroke-width="40"/><text class="dot-label" x="220" y="60">${driver.name_acronym || ''}</text>`;
                            dot.onclick = () => enfocarPilotoVivo(driver.driver_number, driver.broadcast_name, driver.team_name);
                            svg.appendChild(dot);
                        }
                        dot.setAttribute('transform', `translate(${loc.x}, ${loc.y})`);
                        dot.style.opacity = isMortal ? '1' : '0.35';
                    });
                }

                // ── 8. ORDEN DE PILOTOS ──
                let driversToShow = [];
                if (latestPosMap.size > 0) {
                    const driversWithPosition = Array.from(latestPosMap.values())
                        .sort((a, b) => (a.position || 99) - (b.position || 99))
                        .map(p => ({ driver_number: p.driver_number, position: p.position }));
                    const positionedDriverNumbers = new Set(driversWithPosition.map(p => p.driver_number));
                    const driversWithoutPosition = (liveDriversCache || [])
                        .filter(d => !positionedDriverNumbers.has(d.driver_number))
                        .sort((a, b) => a.driver_number - b.driver_number)
                        .map(d => ({ driver_number: d.driver_number, position: null }));

                    driversToShow = [...driversWithPosition, ...driversWithoutPosition];
                } else if (liveDriversCache) {
                    driversToShow = [...liveDriversCache]
                        .sort((a, b) => a.driver_number - b.driver_number)
                        .map(d => ({ driver_number: d.driver_number, position: null }));
                }

                // ── 9. TELEMETRÍA DEL PILOTO ENFOCADO ──
                if (pilotoVivoEnfocado) {
                    const carDataUrl = modoDemoLive
                        ? `https://api.openf1.org/v1/car_data?session_key=${sessionKey}&driver_number=${pilotoVivoEnfocado.numero}`
                        : `https://api.openf1.org/v1/car_data?session_key=${sessionKey}&driver_number=${pilotoVivoEnfocado.numero}&limit=1`;
                    const dataFocus = await fetchJson(carDataUrl);
                    if (dataFocus.length > 0) {
                        const tele = dataFocus[0];
                        document.getElementById('tele-spd-val').innerText = tele.speed ?? 0;
                        document.getElementById('tele-rpm-val').innerText = tele.rpm ?? 0;
                        document.getElementById('tele-gear').innerText = (tele.n_gear > 0) ? tele.n_gear : 'N';
                        document.getElementById('tele-spd-bar').style.width = `${Math.min(100,(tele.speed/350)*100)}%`;
                        document.getElementById('tele-rpm-bar').style.width = `${Math.min(100,(tele.rpm/12000)*100)}%`;
                        document.getElementById('tele-throttle-bar').style.width = `${tele.throttle ?? 0}%`;
                        document.getElementById('tele-brake-bar').style.width = `${tele.brake ?? 0}%`;
                        document.getElementById('tele-throttle-val').innerText = tele.throttle ?? 0;
                        document.getElementById('tele-brake-val').innerText = tele.brake ?? 0;
                        const drsOpen = (tele.drs >= 10);
                        const drsEl = document.getElementById('tele-drs-status');
                        drsEl.innerText = drsOpen ? 'DRS ON' : 'DRS OFF';
                        drsEl.className = `tele-drs-badge ${drsOpen ? 'tele-drs-on' : 'tele-drs-off'}`;
                    }
                }

                // ── 10. TABLAS DE TIMING ──
                let htmlOfficial = '';
                let htmlF15 = '';
                let posF15 = 1;

                // Líder F1.5 para calcular brecha
                const liderF15Num = driversToShow.find(d => {
                    const dr = liveDriversCache?.find(x => x.driver_number === d.driver_number);
                    return dr && !esEquipoExcluidoF15(dr.team_name);
                })?.driver_number;

                driversToShow.forEach(pos => {
                    const driver = liveDriversCache?.find(d => d && d.driver_number === pos.driver_number);
                    if (!driver) return;
                    const isMortal = !esEquipoExcluidoF15(driver.team_name);
                    const lap = latestLapMap.get(driver.driver_number) || {};
                    const interval = latestIntervalMap.get(driver.driver_number);
                    const stint = stintMap.get(driver.driver_number);
                    const teamColor = getTeamColor(driver.team_name);
                    const positionLabel = pos.position ?? '—';
                    const posClass = pos.position === 1 ? 'p1' : pos.position === 2 ? 'p2' : pos.position === 3 ? 'p3' : '';

                    const lapTime = formatearTiempo(lap.lap_duration);
                    const isFastest = lap.is_pit_out_lap === false && lap.lap_duration && lapTime !== '--:--.---';
                    const gapToLeader = formatearGap(interval?.gap_to_leader);
                    const intervalStr = pos.position === 1 ? '<span class="ltt-gap leader">Líder</span>' : `<span class="ltt-interval">${formatearGap(interval?.interval)}</span>`;
                    const gapStr = pos.position === 1 ? '' : `<span class="ltt-gap">${gapToLeader}</span>`;

                    const sectorHtml = `
                        <div class="sector-indicator">
                            <div class="sec-box" style="background:${obtenerColorStatus(obtMejorStatus(lap.segments_sector_1))}"></div>
                            <div class="sec-box" style="background:${obtenerColorStatus(obtMejorStatus(lap.segments_sector_2))}"></div>
                            <div class="sec-box" style="background:${obtenerColorStatus(obtMejorStatus(lap.segments_sector_3))}"></div>
                        </div>
                        <div class="micro-bar">
                            ${generarMicroSectores(lap.segments_sector_1 || [])}
                            ${generarMicroSectores(lap.segments_sector_2 || [])}
                            ${generarMicroSectores(lap.segments_sector_3 || [])}
                        </div>`;

                    const tirHtml = stint ? htmlNeumatico(stint.compound, stint.tyre_age_at_start != null ? (lap.lap_number || 0) - (stint.lap_start || 0) + (stint.tyre_age_at_start || 0) : null) : '<span style="color:#4b5563">—</span>';

                    const fila = `<tr onclick="enfocarPilotoVivo(${driver.driver_number}, '${(driver.broadcast_name||'').replace(/'/g,"\\'")}', '${(driver.team_name||'').replace(/'/g,"\\'")}'); " style="cursor:pointer;">
                        <td class="ltt-pos ${posClass}">${positionLabel}</td>
                        <td>${htmlPilotoLive(driver, teamColor)}</td>
                        <td>${tirHtml}</td>
                        <td style="color:#9ca3af;font-weight:700;font-size:0.78rem;">V${lap.lap_number || '—'}</td>
                        <td class="${isFastest ? 'ltt-lap-fastest' : 'ltt-lap'}">${lapTime}</td>
                        <td>${intervalStr}</td>
                        <td>${gapStr}</td>
                        <td>${sectorHtml}</td>
                    </tr>`;

                    htmlOfficial += fila;

                    if (isMortal) {
                        // Calcular brecha F1.5
                        const liderF15Int = latestIntervalMap.get(liderF15Num);
                        const liderLapDur = latestLapMap.get(liderF15Num)?.lap_duration || 0;
                        const myLapDur = lap.lap_duration || 0;
                        const posF15class = posF15 === 1 ? 'p1' : posF15 === 2 ? 'p2' : posF15 === 3 ? 'p3' : '';

                        htmlF15 += `<tr onclick="enfocarPilotoVivo(${driver.driver_number}, '${(driver.broadcast_name||'').replace(/'/g,"\\'")}', '${(driver.team_name||'').replace(/'/g,"\\'")}');" style="cursor:pointer;">
                            <td class="ltt-pos ${posF15class}">${posF15}</td>
                            <td>${htmlPilotoLive(driver, teamColor)}</td>
                            <td>${tirHtml}</td>
                            <td style="color:#9ca3af;font-weight:700;font-size:0.78rem;">V${lap.lap_number || '—'}</td>
                            <td class="${isFastest ? 'ltt-lap-fastest' : 'ltt-lap'}">${lapTime}</td>
                            <td>${posF15 === 1 ? '<span class="ltt-gap leader">Líder F1.5</span>' : intervalStr}</td>
                            <td>${posF15 === 1 ? '' : gapStr}</td>
                            <td>${sectorHtml}</td>
                        </tr>`;
                        posF15++;
                    }
                });

                document.getElementById('live-timing-official-body').innerHTML = htmlOfficial || '<tr><td colspan="8" class="loading-placeholder">Sin datos de posición aún.</td></tr>';
                document.getElementById('live-timing-body').innerHTML = htmlF15 || '<tr><td colspan="8" class="loading-placeholder">Sin mortales en pista.</td></tr>';

                // ── 11. PIT STOPS ──
                if (allPits && allPits.length > 0) {
                    const pitsOrdenados = [...allPits].sort((a, b) => (b.lap_number || 0) - (a.lap_number || 0)).slice(0, 15);
                    let pitHtml = '';
                    pitsOrdenados.forEach(p => {
                        const driver = liveDriversCache?.find(d => d.driver_number === p.driver_number);
                        const nombre = driver?.name_acronym || driver?.broadcast_name || `#${p.driver_number}`;
                        const dur = p.pit_duration ? parseFloat(p.pit_duration).toFixed(1) : null;
                        const esSlow = dur && parseFloat(dur) > 30;
                        pitHtml += `<div class="pit-row">
                            <span style="color:${getTeamColor(driver?.team_name)};font-weight:900;font-size:0.8rem;min-width:36px;">${nombre}</span>
                            <span class="pit-lap">V${p.lap_number || '—'}</span>
                            <span style="flex:1;font-size:0.7rem;color:#4b5563;">${driver?.team_name || ''}</span>
                            ${dur ? `<span class="pit-duration ${esSlow ? 'slow' : ''}">${dur}s</span>` : '<span style="color:#4b5563;font-size:0.75rem;">En boxes</span>'}
                        </div>`;
                    });
                    document.getElementById('pit-stops-body').innerHTML = pitHtml;
                } else {
                    document.getElementById('pit-stops-body').innerHTML = '<div class="loading-placeholder" style="padding:20px;">Sin pit stops registrados.</div>';
                }

                // ── 12. RACE CONTROL ──
                if (allRaceControl && allRaceControl.length > 0) {
                    const rcRecientes = [...allRaceControl].reverse().slice(0, 20);
                    let rcHtml = '';
                    rcRecientes.forEach(msg => {
                        const hora = msg.date ? new Date(msg.date).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
                        let flagClass = 'rc-INFO';
                        let flagLabel = msg.flag || msg.category || 'INFO';
                        if (msg.flag === 'GREEN') flagClass = 'rc-GREEN';
                        else if (msg.flag === 'YELLOW' || msg.flag === 'DOUBLE YELLOW') flagClass = 'rc-YELLOW';
                        else if (msg.flag === 'RED') flagClass = 'rc-RED';
                        else if (msg.flag === 'CHEQUERED') { flagClass = 'rc-CHEQUERED'; flagLabel = 'FINISH'; }
                        else if (msg.category === 'SafetyCar' || msg.message?.includes('SAFETY CAR')) flagClass = 'rc-SC';
                        rcHtml += `<div class="rc-row">
                            <span class="rc-flag ${flagClass}">${flagLabel}</span>
                            <span class="rc-text">${msg.message || '—'}</span>
                            <span class="rc-time">${hora}</span>
                        </div>`;
                    });
                    document.getElementById('race-control-body').innerHTML = rcHtml;
                } else {
                    document.getElementById('race-control-body').innerHTML = '<div class="loading-placeholder" style="padding:20px;">Sin mensajes de control.</div>';
                }

                // ── 13. TEAM RADIO ──
                if (allTeamRadio && allTeamRadio.length > 0) {
                    const radioReciente = [...allTeamRadio].reverse().slice(0, 10);
                    let radioHtml = '';
                    radioReciente.forEach(r => {
                        const driver = liveDriversCache?.find(d => d.driver_number === r.driver_number);
                        const nombre = driver?.name_acronym || `#${r.driver_number}`;
                        const hora = r.date ? new Date(r.date).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';
                        const teamColor = getTeamColor(driver?.team_name);
                        const audioId = `audio-${r.driver_number}-${r.date?.replace(/\W/g, '')}`;
                        radioHtml += `<div class="radio-row">
                            <span class="radio-driver" style="color:${teamColor};">${nombre}</span>
                            <span class="radio-time">${hora}</span>
                            <span style="flex:1;font-size:0.7rem;color:#4b5563;">${driver?.team_name || ''}</span>
                            ${r.recording_url ? `<button class="radio-play-btn" id="btn-${audioId}" onclick="reproducirRadio('${r.recording_url}', 'btn-${audioId}')" title="Reproducir">▶</button>` : '<span style="color:#4b5563;font-size:0.65rem;">Sin audio</span>'}
                        </div>`;
                    });
                    document.getElementById('team-radio-body').innerHTML = radioHtml;
                } else {
                    document.getElementById('team-radio-body').innerHTML = '<div class="loading-placeholder" style="padding:20px;">Sin transmisiones de radio disponibles.</div>';
                }

            } catch (err) {
                if (!isCurrentUpdate()) return;
                console.error('Error Live:', err);
                const errMsg = '<tr><td colspan="8" class="loading-placeholder">Error al conectar con la API. Reintentando...</td></tr>';
                document.getElementById('live-timing-official-body').innerHTML = errMsg;
                document.getElementById('live-timing-body').innerHTML = errMsg;
            } finally {
                if (isCurrentUpdate()) isUpdatingLive = false;
            }
        }

        // ── REPRODUCTOR DE RADIO ──
        let audioActual = null;
        let btnActual = null;
        function reproducirRadio(url, btnId) {
            const btn = document.getElementById(btnId);
            if (audioActual && !audioActual.paused) {
                audioActual.pause();
                if (btnActual) { btnActual.innerText = '▶'; btnActual.classList.remove('playing'); }
                if (btnActual === btn) { audioActual = null; btnActual = null; return; }
            }
            audioActual = new Audio(url);
            btnActual = btn;
            btn.innerText = '■';
            btn.classList.add('playing');
            audioActual.play().catch(() => {});
            audioActual.onended = () => { btn.innerText = '▶'; btn.classList.remove('playing'); audioActual = null; btnActual = null; };
        }

        async function cargarDatosLive() {
            if (anioActual !== "current") return;

            const apiPilotos = "https://api.jolpi.ca/ergast/f1/current/driverStandings.json";
            const apiConst = "https://api.jolpi.ca/ergast/f1/current/constructorStandings.json";
            const apiResultados = "https://api.jolpi.ca/ergast/f1/current/results.json";
            const apiSprints = "https://api.jolpi.ca/ergast/f1/current/sprint.json";
            const infoDiv = document.getElementById('ultima-actualizacion');

            try {
                const [resPilotos, resConst, carreras, sprints] = await Promise.all([
                    fetch(apiPilotos),
                    fetch(apiConst),
                    obtenerCarrerasPaginadas(apiResultados, 'Results'),
                    obtenerCarrerasPaginadas(apiSprints, 'SprintResults')
                ]);

                const dPilotos = await resPilotos.json();
                const dConst = await resConst.json();

                carrerasCache = carreras;
                sprintsCache = sprints;

                const f1Pilotos = dPilotos.MRData.StandingsTable.StandingsLists[0]?.DriverStandings || [];
                const f1Const = dConst.MRData.StandingsTable.StandingsLists[0]?.ConstructorStandings || [];

                const f15Calculado = procesarCampeonatoCompleto(carrerasCache, sprintsCache, f1Pilotos);
                f15PilotosCache = f15Calculado.listaPilotos;

                renderizarTablasDashboard(f1Pilotos, f15PilotosCache, f1Const, f15Calculado.listaConst);
                generarMenuCarreras(carrerasCache, sprintsCache);
                generarTablaCronica(carrerasCache, sprintsCache);
                inicializarSelectorAnos();

                if (anioActual === "current") {
                    const ahora = new Date();
                    infoDiv.innerHTML = `Sincronizado: Telemetría Activa — ${ahora.toLocaleTimeString('es-AR')}`;
                    infoDiv.className = "info-actualizacion estado-ok";
                }
            } catch (err) {
                console.error(err);
                if (anioActual === "current") {
                    infoDiv.innerHTML = ` Fallo de conexión de red...`;
                    infoDiv.className = "info-actualizacion estado-warning";
                }
            }
        }

        // INICIALIZACIÓN DEL SELECTOR DE TEMPORADAS EN EL MODAL DE PILOTO
        function inicializarSelectorPerfilPiloto() {
            const select = document.getElementById('selector-ano-perfil');
            if (!select || select.children.length > 0) return;

            let optCurrent = document.createElement('option');
            optCurrent.value = "current";
            optCurrent.innerText = `${ANIO_ACTUAL_VISIBLE} (Actual)`;
            select.appendChild(optCurrent);

            // Todos los años desde 1950 hasta el actual
            for (let a = ANIO_ACTUAL_VISIBLE; a >= 1950; a--) {
                let opt = document.createElement('option');
                opt.value = a;
                opt.innerText = a;
                select.appendChild(opt);
            }
        }

        // CACHE POR TEMPORADA PARA NO REPETIR LLAMADAS A LA API
        const perfilDatosTemporadaCache = {};

        // Carga completa (results + sprints): para años con F1.5 (2014+)
        async function obtenerDatosTemporadaPerfil(ano) {
            const clave = String(ano);
            if (perfilDatosTemporadaCache[clave]) return perfilDatosTemporadaCache[clave];

            const anioNum = parseInt(ano);
            if (anioNum < 2014) {
                // Para años históricos solo necesitamos standings, no resultados completos
                return await obtenerStandingsHistorico(ano);
            }

            const urlPilotos = `https://api.jolpi.ca/ergast/f1/${ano}/driverStandings.json`;
            const urlResultados = `https://api.jolpi.ca/ergast/f1/${ano}/results.json`;
            const urlSprints = `https://api.jolpi.ca/ergast/f1/${ano}/sprint.json`;

            const [resPilotos, carreras, sprints] = await Promise.all([
                fetch(urlPilotos),
                obtenerCarrerasPaginadas(urlResultados, 'Results'),
                obtenerCarrerasPaginadas(urlSprints, 'SprintResults')
            ]);

            const dPilotos = await resPilotos.json();
            const f1Pilotos = dPilotos.MRData.StandingsTable.StandingsLists[0]?.DriverStandings || [];
            const f15Calculado = procesarCampeonatoCompleto(carreras, sprints, f1Pilotos);

            const datos = { f1Pilotos, carreras, sprints, f15Pilotos: f15Calculado.listaPilotos };
            perfilDatosTemporadaCache[clave] = datos;
            return datos;
        }

        // Carga histórica pre-2014: standings + resultados carrera a carrera (sin sprints ni F1.5)
        async function obtenerStandingsHistorico(ano) {
            const clave = String(ano);
            if (perfilDatosTemporadaCache[clave]) return perfilDatosTemporadaCache[clave];

            const urlPilotos = `https://api.jolpi.ca/ergast/f1/${ano}/driverStandings.json`;
            const urlResultados = `https://api.jolpi.ca/ergast/f1/${ano}/results.json`;

            const [resPilotos, carreras] = await Promise.all([
                fetch(urlPilotos),
                obtenerCarrerasPaginadas(urlResultados, 'Results')
            ]);

            const data = await resPilotos.json();
            const f1Pilotos = data.MRData.StandingsTable.StandingsLists[0]?.DriverStandings || [];

            const datos = { f1Pilotos, carreras, sprints: [], f15Pilotos: [] };
            perfilDatosTemporadaCache[clave] = datos;
            return datos;
        }

        async function cambiarTemporadaPerfil(ano) {
            if (!pilotoPerfilActual) return;

            const loadingSpan = document.getElementById('espn-cargando-temp');
            if (loadingSpan) loadingSpan.style.display = 'inline';

            try {
                const datos = await obtenerDatosTemporadaPerfil(ano);

                const pF1 = datos.f1Pilotos.find(p => p.Driver.driverId === pilotoPerfilActual);
                const pF15 = datos.f15Pilotos.find(p => p.id === pilotoPerfilActual);

                // Actualizar widget F1 Oficial
                if (pF1) {
                    document.getElementById('espn-f1-pos').innerText = pF1.position;
                    document.getElementById('espn-f1-pts').innerText = pF1.points;
                    const liderPts = datos.f1Pilotos[0]?.points || 0;
                    const gap = pF1.position === "1" ? "Líder" : `${(liderPts - pF1.points).toFixed(0)}`;
                    document.getElementById('espn-f1-gap').innerText = gap;
                } else {
                    document.getElementById('espn-f1-pos').innerText = '-';
                    document.getElementById('espn-f1-pts').innerText = '-';
                    document.getElementById('espn-f1-gap').innerText = '-';
                }

                // Actualizar widget F1.5
                if (pF15) {
                    const posF15 = datos.f15Pilotos.findIndex(p => p.id === pilotoPerfilActual) + 1;
                    document.getElementById('espn-f15-partidas').innerText = posF15 > 0 ? posF15 : '-';
                    document.getElementById('espn-f15-victorias').innerText = pF15.victorias;
                    document.getElementById('espn-f15-podios').innerText = pF15.podios;
                } else {
                    document.getElementById('espn-f15-partidas').innerText = '-';
                    document.getElementById('espn-f15-victorias').innerText = '-';
                    document.getElementById('espn-f15-podios').innerText = '-';
                }

                // Recalcular los paneles con datos de la temporada elegida
                renderizarPanelesPerfilPilotoConDatos(pilotoPerfilActual, pF1, pF15, datos.carreras, datos.sprints, datos.f15Pilotos);

            } catch (err) {
                console.error('Error al cargar temporada del perfil:', err);
            } finally {
                if (loadingSpan) loadingSpan.style.display = 'none';
            }
        }

        // VERSIÓN GENERALIZADA DE renderizarPanelesPerfilPiloto QUE ACEPTA DATOS EXTERNOS
        function renderizarPanelesPerfilPilotoConDatos(driverId, pF1, pF15, carreras, sprints, f15Pilotos) {
            const nombre = pF1
                ? `${pF1.Driver.givenName} ${pF1.Driver.familyName}`
                : (pF15?.name || driverId);
            const escuderia = pF1?.Constructors[0]?.name || pF15?.team || "Sin Equipo";
            const posicionF15 = f15Pilotos.findIndex(p => p.id === driverId) + 1;
            const puntosF15 = pF15 ? pF15.pts : 0;

            const carrerasConResultado = carreras.filter(c =>
                (c.Results || []).some(res => res.Driver.driverId === driverId)
            );

            const rondasConPuntosF15 = carreras.filter(c => {
                // Calcular sobre los datos de esta temporada específica
                let pts = 0;
                const carrera = carreras.find(x => x.round === c.round);
                if (carrera?.Results) {
                    let posF15 = 0;
                    for (let res of carrera.Results) {
                        if (!esEquipoExcluidoF15(res.Constructor.name)) {
                            if (res.Driver.driverId === driverId) {
                                if (posF15 < PUNTOS_CARRERA.length) pts += PUNTOS_CARRERA[posF15];
                                break;
                            }
                            posF15++;
                        }
                    }
                }
                const sprint = sprints.find(s => s.round === c.round);
                if (sprint?.SprintResults) {
                    let posF15 = 0;
                    for (let res of sprint.SprintResults) {
                        if (!esEquipoExcluidoF15(res.Constructor.name)) {
                            if (res.Driver.driverId === driverId) {
                                if (posF15 < PUNTOS_SPRINT.length) pts += PUNTOS_SPRINT[posF15];
                                break;
                            }
                            posF15++;
                        }
                    }
                }
                return pts > 0;
            }).length;

            document.getElementById('espn-panel-perfil').innerHTML = `
                <div class="espn-panel-grid">
                    <div class="espn-dato"><span>Piloto</span><strong>${nombre}</strong></div>
                    <div class="espn-dato"><span>Equipo</span><strong>${escuderia}</strong></div>
                    <div class="espn-dato"><span>Nacionalidad</span><strong>${pF1?.Driver?.nationality || pF15?.nationality || '-'}</strong></div>
                </div>
            `;

            document.getElementById('espn-panel-estadisticas').innerHTML = `
                <div class="espn-panel-grid">
                    <div class="espn-dato"><span>Posición F1.5</span><strong>${posicionF15 > 0 ? posicionF15 : '-'}</strong></div>
                    <div class="espn-dato"><span>Puntos F1.5</span><strong>${puntosF15}</strong></div>
                    <div class="espn-dato"><span>Rondas con puntos</span><strong>${rondasConPuntosF15}</strong></div>
                    <div class="espn-dato"><span>Victorias F1.5</span><strong>${pF15 ? pF15.victorias : '-'}</strong></div>
                    <div class="espn-dato"><span>Podios F1.5</span><strong>${pF15 ? pF15.podios : '-'}</strong></div>
                    <div class="espn-dato"><span>Carreras disputadas</span><strong>${carrerasConResultado.length}</strong></div>
                </div>
            `;

            const filasResultados = carreras.map(carrera => {
                const resF1 = (carrera.Results || []).find(res => res.Driver.driverId === driverId);
                const puntosF1 = resF1 ? (parseFloat(resF1.points) || 0) : 0;

                // Calcular puntos F1.5 para esta carrera con los datos de esta temporada
                let puntosMortal = 0;
                if (carrera.Results) {
                    let posF15 = 0;
                    for (let res of carrera.Results) {
                        if (!esEquipoExcluidoF15(res.Constructor.name)) {
                            if (res.Driver.driverId === driverId) {
                                if (posF15 < PUNTOS_CARRERA.length) puntosMortal += PUNTOS_CARRERA[posF15];
                                break;
                            }
                            posF15++;
                        }
                    }
                }
                const sprint = sprints.find(s => s.round === carrera.round);
                if (sprint?.SprintResults) {
                    let posF15 = 0;
                    for (let res of sprint.SprintResults) {
                        if (!esEquipoExcluidoF15(res.Constructor.name)) {
                            if (res.Driver.driverId === driverId) {
                                if (posF15 < PUNTOS_SPRINT.length) puntosMortal += PUNTOS_SPRINT[posF15];
                                break;
                            }
                            posF15++;
                        }
                    }
                }

                const posF1 = resF1?.position || '-';
                return `<tr>
                    <td>R${carrera.round}</td>
                    <td>${carrera.raceName}</td>
                    <td>${posF1}</td>
                    <td class="pts">${puntosF1 || '-'}</td>
                    <td class="pts">${puntosMortal || '-'}</td>
                </tr>`;
            }).join('');

            document.getElementById('espn-panel-resultados').innerHTML = `
                <div class="espn-resultados-wrap">
                    <table class="espn-resultados-table">
                        <thead><tr><th>Ronda</th><th>GP</th><th>Pos F1</th><th>Pts F1</th><th>Pts F1.5</th></tr></thead>
                        <tbody>${filasResultados || '<tr><td colspan="5" class="loading-placeholder">Sin datos para esta temporada.</td></tr>'}</tbody>
                    </table>
                </div>
            `;
        }

        // =====================================================
        // CAMPEONES - DATOS HISTÓRICOS F1 (1950-presente)
        // =====================================================

        // Mapa de escuderías a país de origen para la bandera
        const MAPA_PAISES_ESCUDERIA = {
            "Ferrari": "it", "McLaren": "gb", "Mercedes": "de", "Red Bull": "at",
            "Williams": "gb", "Renault": "fr", "Alpine": "fr", "AlphaTauri": "it",
            "Alfa Romeo": "ch", "Haas F1 Team": "us", "Aston Martin": "gb",
            "Brabham": "gb", "Lotus": "gb", "Tyrrell": "gb", "BRM": "gb",
            "Matra": "fr", "March": "gb", "Ligier": "fr", "Cooper": "gb",
            "Vanwall": "gb", "Benetton": "gb", "Jordan": "ie", "BAR": "gb",
            "Honda": "jp", "Toyota": "jp", "Sauber": "ch", "Force India": "in",
            "Racing Point": "gb", "Toro Rosso": "it", "Minardi": "it",
            "Stewart": "gb", "Jaguar": "gb", "Arrows": "gb", "Lola": "gb",
            "Prost": "fr", "Osella": "it", "Footwork": "gb", "Dallara": "it",
            "Simtek": "gb", "Pacific": "gb", "Forti": "it", "MasterCard Lola": "gb",
            "Super Aguri": "jp", "Spyker": "nl", "HRT": "es", "Caterham": "gb",
            "Marussia": "gb", "Manor Marussia": "gb", "Virgin": "gb",
            "Visa Cash App RB": "it", "RB F1 Team": "it"
        };

        function escuderiaBandera(nombreEscuderia) {
            for (const [key, val] of Object.entries(MAPA_PAISES_ESCUDERIA)) {
                if (nombreEscuderia.toLowerCase().includes(key.toLowerCase())) {
                    return `<img class="banderita" src="https://flagcdn.com/w20/${val}.png" alt="${key}">`;
                }
            }
            return '';
        }

        let modoCampeones = 'f1';
        const campeonesF1Cache = {};   // { anio: { standings, race } }
        const campeonesF15Cache = {};  // calculados de procesarCampeonatoCompleto

        // Años históricos F1 desde 1950
        const ANIOS_F1 = Array.from({ length: new Date().getFullYear() - 1950 + 1 }, (_, i) => new Date().getFullYear() - i);
        // Años F1.5 disponibles (mismo rango que el selector global: 2014-actual)
        const ANIOS_F15 = Array.from({ length: new Date().getFullYear() - 2014 + 1 }, (_, i) => new Date().getFullYear() - i); // 2014 → año actual inclusive

        async function cambiarModoCampeones(modo) {
            modoCampeones = modo;
            document.getElementById('btn-camp-f1').classList.toggle('active', modo === 'f1');
            document.getElementById('btn-camp-f15').classList.toggle('active', modo === 'f15');
            await renderizarCampeones();
        }

        async function renderizarCampeones() {
            const contenedor = document.getElementById('lista-campeones');
            if (!contenedor) return;

            contenedor.innerHTML = '<div class="loading-placeholder"> Cargando campeones...</div>';

            if (modoCampeones === 'f1') {
                await renderizarCampeonesF1(contenedor);
            } else {
                await renderizarCampeonesF15(contenedor);
            }
        }

        async function renderizarCampeonesF1(contenedor) {
            let html = '';

            for (const anio of ANIOS_F1) {
                if (!campeonesF1Cache[anio]) {
                    try {
                        const res = await fetch(`https://api.jolpi.ca/ergast/f1/${anio}/driverStandings.json`);
                        const data = await res.json();
                        const standings = data.MRData.StandingsTable.StandingsLists[0]?.DriverStandings || [];

                        // Buscar el auto del campeón (nombre del constructor del 1º clasificado)
                        campeonesF1Cache[anio] = standings;
                    } catch {
                        campeonesF1Cache[anio] = [];
                    }
                }

                const standings = campeonesF1Cache[anio];
                if (!standings.length) continue;

                const campeon = standings[0];
                const segundo = standings[1];
                const tercero = standings[2];

                const nombreCampeon = `${campeon.Driver.givenName} ${campeon.Driver.familyName}`;
                const flagCampeon = generarBanderaImg(campeon.Driver.nationality);
                const escuderia = campeon.Constructors[0]?.name || '-';
                const flagEsc = escuderiaBandera(escuderia);
                const auto = campeon.Constructors[0]?.name || '-';
                const driverId = campeon.Driver.driverId;

                // Piloto clickeable solo si está en la temporada actual cargada
                const nombreHtml = `<div class="campeon-piloto-nombre" onclick="abrirPerfilTemporada('${driverId}', ${anio})">${flagCampeon} ${nombreCampeon}</div>`;

                const podioHtml = [segundo, tercero].map((p, i) => {
                    if (!p) return '';
                    const nombre = `${p.Driver.givenName} ${p.Driver.familyName}`;
                    const flag = generarBanderaImg(p.Driver.nationality);
                    const eq = p.Constructors[0]?.name || '-';
                    const pid = p.Driver.driverId;
                    const posClass = i === 0 ? 'p2' : 'p3';
                    const posLabel = i === 0 ? '2°' : '3°';
                    return `<div class="podio-fila">
                        <div class="podio-pos ${posClass}">${posLabel}</div>
                        <div class="podio-nombre" onclick="abrirPerfilTemporada('${pid}', ${anio})">${flag} ${nombre}</div>
                        <div class="podio-equipo">${eq}</div>
                        <div class="podio-puntos">${p.points} pts</div>
                    </div>`;
                }).join('');

                html += `
                <div class="campeon-card">
                    <div class="campeon-header">
                        <div class="campeon-anio">${anio}</div>
                        <div class="campeon-trofeo"><img src="assets/trofeo-f1.png" alt="Trofeo Campeonato" /></div>
                        <div class="campeon-piloto-info">
                            ${nombreHtml}
                            <div class="campeon-escuderia">${flagEsc} ${escuderia}</div>
                            <div class="campeon-auto">${auto}</div>
                        </div>
                        <div class="campeon-pts"><span>Puntos</span>${campeon.points}</div>
                    </div>
                    ${podioHtml ? `<div class="campeon-podio">${podioHtml}</div>` : ''}
                </div>`;

                // Actualizar progresivamente cada 5 años
                if (anio % 5 === 0 || anio === ANIOS_F1[0]) {
                    contenedor.innerHTML = html + '<div class="loading-placeholder" style="padding:10px;">Cargando más...</div>';
                    await new Promise(r => setTimeout(r, 0));
                }
            }

            contenedor.innerHTML = html || '<div class="loading-placeholder">Sin datos disponibles.</div>';
        }

        async function renderizarCampeonesF15(contenedor) {
            let html = '';

            for (const anio of ANIOS_F15) {
                if (!campeonesF15Cache[anio]) {
                    try {
                        // Reusar cache de perfilDatosTemporadaCache si ya existe
                        let datos = perfilDatosTemporadaCache[String(anio)];
                        if (!datos) {
                            datos = await obtenerDatosTemporadaPerfil(String(anio));
                        }
                        const calculado = procesarCampeonatoCompleto(datos.carreras, datos.sprints, datos.f1Pilotos);
                        campeonesF15Cache[anio] = { pilotos: calculado.listaPilotos, f1Pilotos: datos.f1Pilotos, carreras: datos.carreras, sprints: datos.sprints };
                    } catch {
                        campeonesF15Cache[anio] = { pilotos: [], f1Pilotos: [], carreras: [], sprints: [] };
                    }
                }

                const { pilotos, f1Pilotos } = campeonesF15Cache[anio];
                if (!pilotos.length) continue;

                const campeon = pilotos[0];
                const segundo = pilotos[1];
                const tercero = pilotos[2];

                const flagCampeon = generarBanderaImg(campeon.nationality);
                const flagEsc = escuderiaBandera(campeon.team);
                const nombreHtml = `<div class="campeon-piloto-nombre" onclick="abrirPerfilTemporada('${campeon.id}', ${anio})">${flagCampeon} ${campeon.name}</div>`;

                const podioHtml = [segundo, tercero].map((p, i) => {
                    if (!p) return '';
                    const flag = generarBanderaImg(p.nationality);
                    const posClass = i === 0 ? 'p2' : 'p3';
                    const posLabel = i === 0 ? '2°' : '3°';
                    return `<div class="podio-fila">
                        <div class="podio-pos ${posClass}">${posLabel}</div>
                        <div class="podio-nombre" onclick="abrirPerfilTemporada('${p.id}', ${anio})">${flag} ${p.name}</div>
                        <div class="podio-equipo">${p.team}</div>
                        <div class="podio-puntos">${p.pts} pts</div>
                    </div>`;
                }).join('');

                html += `
                <div class="campeon-card">
                    <div class="campeon-header">
                        <div class="campeon-anio">${anio}</div>
                        <div class="campeon-trofeo"></div>
                        <div class="campeon-piloto-info">
                            ${nombreHtml}
                            <div class="campeon-escuderia">${flagEsc} ${campeon.team}</div>
                        </div>
                        <div class="campeon-pts"><span>Puntos</span>${campeon.pts}</div>
                    </div>
                    ${podioHtml ? `<div class="campeon-podio">${podioHtml}</div>` : ''}
                </div>`;

                // Render progresivo
                contenedor.innerHTML = html + '<div class="loading-placeholder" style="padding:10px;">Cargando más...</div>';
                await new Promise(r => setTimeout(r, 0));
            }

            contenedor.innerHTML = html || '<div class="loading-placeholder">Sin datos disponibles.</div>';
        }

        // Disparar carga cuando se activa el tab Campeones
        const _cambiarPestañaOriginal = cambiarPestaña;
        cambiarPestaña = function(event, tabId) {
            _cambiarPestañaOriginal(event, tabId);
            if (tabId === 'campeones' && document.getElementById('lista-campeones')?.innerHTML?.includes('Cargando')) {
                renderizarCampeones();
            }
        };

        // =====================================================
        // MODAL PERFIL TEMPORADA PILOTO (desde Campeones)
        // =====================================================
        function cerrarModalTempPiloto() {
            document.getElementById('modal-temp-piloto').style.display = 'none';
        }

        async function abrirPerfilTemporada(driverId, anio) {
            const modal = document.getElementById('modal-temp-piloto');
            modal.style.display = 'flex';

            // Reset
            document.getElementById('mtp-nombre').innerText = '...';
            document.getElementById('mtp-anio-badge').innerText = anio;
            document.getElementById('mtp-meta').innerHTML = '<span style="color:#4b5563">Cargando datos...</span>';
            document.getElementById('mtp-stats').innerHTML = '';
            document.getElementById('mtp-tabla-body').innerHTML = '<tr><td colspan="6" class="loading-placeholder">Cargando...</td></tr>';

            // Cargar datos del año si no están cacheados
            const clave = String(anio);
            if (!perfilDatosTemporadaCache[clave]) {
                try { await obtenerDatosTemporadaPerfil(clave); } catch(e) { console.error(e); }
            }

            const datos = perfilDatosTemporadaCache[clave];
            if (!datos) {
                document.getElementById('mtp-meta').innerHTML = '<span style="color:#e10600">Error cargando datos</span>';
                return;
            }

            const pF1 = datos.f1Pilotos.find(p => p.Driver.driverId === driverId);
            const pF15 = datos.f15Pilotos.find(p => p.id === driverId);

            if (!pF1) {
                document.getElementById('mtp-meta').innerHTML = '<span style="color:#4b5563">Piloto sin datos para este año</span>';
                return;
            }

            const nombre = `${pF1.Driver.givenName} ${pF1.Driver.familyName}`;
            const equipo = pF1.Constructors[0]?.name || '-';
            const flag = generarBanderaImg(pF1.Driver.nationality);
            const flagEsc = escuderiaBandera(equipo);
            const numero = pF1.Driver.permanentNumber ? `#${pF1.Driver.permanentNumber}` : '';

            document.getElementById('mtp-nombre').innerText = nombre + ' ';
            document.getElementById('mtp-meta').innerHTML = `${flag} ${pF1.Driver.nationality} &nbsp;|&nbsp; ${flagEsc} ${equipo} &nbsp;${numero ? `| ${numero}` : ''}`;

            // Foto: primero carpeta local /pilotos/, si falla → Wikipedia, si falla → placeholder
            cargarFotoPiloto(document.getElementById('mtp-foto'), driverId, pF1.Driver.url);

            // Detectar si es año pre-2014 (sin datos F1.5)
            const esPreF15 = anio < 2014;
            const liderF1pts = datos.f1Pilotos[0]?.points || 0;
            const gapF1 = pF1.position === '1' ? 'Líder' : `-${(liderF1pts - pF1.points).toFixed(0)}`;
            const gpsDisputados = datos.carreras.filter(c => (c.Results||[]).some(r => r.Driver.driverId === driverId)).length;

            // Stats: si es pre-2014, mostrar solo datos F1 y aviso
            if (esPreF15) {
                document.getElementById('mtp-stats').innerHTML = `
                    <div class="modal-temp-stat"><span>Pos F1 oficial</span><strong>${pF1.position}</strong></div>
                    <div class="modal-temp-stat"><span>Puntos F1</span><strong>${pF1.points}</strong></div>
                    <div class="modal-temp-stat"><span>Brecha líder F1</span><strong style="font-size:1rem">${gapF1}</strong></div>
                    <div class="modal-temp-stat"><span>GPs disputados</span><strong>${gpsDisputados || '-'}</strong></div>
                    <div class="modal-temp-stat" style="grid-column:1/-1; background:rgba(245,158,11,0.06); border-color:rgba(245,158,11,0.15);">
                    <span style="color:#f59e0b;">Sin datos F1.5</span>
                        <strong style="font-size:0.85rem; color:#9ca3af; font-weight:500;">El campeonato F1.5 comienza en 2014. Para este año solo hay datos del campeonato oficial de F1.</strong>
                    </div>
                `;
                // Para pre-2014 sí hay carreras, renderizar tabla solo con columnas F1 (sin F1.5)
                const theadEl = document.querySelector('#modal-temp-piloto .modal-temp-tabla thead tr');
                if (theadEl) theadEl.innerHTML = '<th>Pos F1</th><th>Gran Premio</th><th>Escudería</th><th class="r">Pts F1</th><th>Estado</th>';

                let filasHist = '';
                for (const carrera of datos.carreras) {
                    const resF1 = (carrera.Results || []).find(r => r.Driver.driverId === driverId);
                    if (!resF1) continue;
                    const posF1num = parseInt(resF1.position) || 99;
                    const ptsF1car = parseFloat(resF1.points) || 0;
                    const estado = resF1.status || '-';
                    const esDNF = !['Finished','+1 Lap','+2 Laps','+3 Laps','+4 Laps','+5 Laps'].includes(estado) && posF1num > 20;
                    const posClass = posF1num===1?'p1':posF1num===2?'p2':posF1num===3?'p3':'';
                    filasHist += `<tr>
                        <td class="mtt-pos ${posClass} ${esDNF?'mtt-dnf':''}">${esDNF ? 'DNF' : resF1.position}</td>
                        <td class="mtt-gp">GP ${carrera.raceName}<span class="mtt-sub">R${carrera.round} · ${carrera.Circuit?.Location?.country||''}</span></td>
                        <td style="color:#6b7280;font-size:0.78rem;">${resF1.Constructor.name}</td>
                        <td class="mtt-pts-f1">${ptsF1car||'-'}</td>
                        <td style="color:#4b5563;font-size:0.75rem;">${estado}</td>
                    </tr>`;
                }
                document.getElementById('mtp-tabla-body').innerHTML = filasHist || '<tr><td colspan="5" class="loading-placeholder">Sin resultados disponibles.</td></tr>';
                return;
            }

            // Detectar si el piloto es de un equipo excluido del F1.5 (Ferrari, McLaren, Mercedes, Red Bull)
            const equipoPiloto = pF1.Constructors[0]?.name || '';
            const esExcluidoF15 = esEquipoExcluidoF15(equipoPiloto);

            // Stats completos (2014+)
            const posF15 = pF15 ? datos.f15Pilotos.findIndex(p => p.id === driverId) + 1 : '-';
            const ptsF15 = pF15 ? pF15.pts : '-';
            const victorias = pF15 ? pF15.victorias : '-';
            const podios = pF15 ? pF15.podios : '-';

            const statsF15Html = esExcluidoF15
                ? `<div class="modal-temp-stat" style="grid-column:3/5; background:rgba(225,6,0,0.05); border-color:rgba(225,6,0,0.15);">
                        <span style="color:#e10600;"> Excluido del F1.5</span>
                        <strong style="font-size:0.82rem; color:#6b7280; font-weight:500;">${equipoPiloto} es un equipo top, no compite en el campeonato de Mortales.</strong>
                   </div>`
                : `<div class="modal-temp-stat f15"><span>Pos F1.5</span><strong>${posF15}</strong></div>
                   <div class="modal-temp-stat f15"><span>Pts F1.5</span><strong>${ptsF15}</strong></div>
                   <div class="modal-temp-stat f15"><span>Victorias F1.5</span><strong>${victorias}</strong></div>
                   <div class="modal-temp-stat f15"><span>Podios F1.5</span><strong>${podios}</strong></div>`;

            document.getElementById('mtp-stats').innerHTML = `
                <div class="modal-temp-stat"><span>Pos F1 oficial</span><strong>${pF1.position}</strong></div>
                <div class="modal-temp-stat"><span>Puntos F1</span><strong>${pF1.points}</strong></div>
                ${statsF15Html}
                <div class="modal-temp-stat"><span>Brecha líder F1</span><strong style="font-size:1rem">${gapF1}</strong></div>
                <div class="modal-temp-stat"><span>GPs disputados</span><strong>${gpsDisputados}</strong></div>
            `;

            // Tabla carrera por carrera (solo 2014+)
            // Si es excluido F1.5, ocultar columnas F1.5 en el header
            const theadEl = document.querySelector('#modal-temp-piloto .modal-temp-tabla thead tr');
            if (theadEl) {
                theadEl.innerHTML = esExcluidoF15
                    ? '<th>Pos F1</th><th>Gran Premio</th><th>Escudería</th><th class="r">Pts F1</th><th>Estado</th>'
                    : '<th>Pos F1</th><th>Gran Premio</th><th>Escudería</th><th class="r">Pts F1</th><th>Pos F1.5</th><th class="r">Pts F1.5</th>';
            }

            let filas = '';
            for (const carrera of datos.carreras) {
                const resF1 = (carrera.Results || []).find(r => r.Driver.driverId === driverId);
                if (!resF1) continue;

                const posF1num = parseInt(resF1.position) || 99;
                const ptsF1car = parseFloat(resF1.points) || 0;
                const estado = resF1.status || '';
                const esDNF = !['Finished','+1 Lap','+2 Laps','+3 Laps','+4 Laps','+5 Laps'].includes(estado) && posF1num > 20;

                // Pos F1.5 en esa carrera
                let posF15car = '-';
                let ptsF15car = 0;
                if (carrera.Results) {
                    let p = 0;
                    for (const r of carrera.Results) {
                        if (!esEquipoExcluidoF15(r.Constructor.name)) {
                            if (r.Driver.driverId === driverId) {
                                posF15car = p + 1;
                                if (p < PUNTOS_CARRERA.length) ptsF15car += PUNTOS_CARRERA[p];
                                break;
                            }
                            p++;
                        }
                    }
                }

                // Sprint si la hay
                const sprintData = datos.sprints.find(s => s.round === carrera.round);
                let sprintFila = '';
                if (sprintData?.SprintResults) {
                    const resS = sprintData.SprintResults.find(r => r.Driver.driverId === driverId);
                    if (resS) {
                        const posS = parseInt(resS.position);
                        let posF15S = '-'; let ptsF15S = 0;
                        let ps = 0;
                        for (const r of sprintData.SprintResults) {
                            if (!esEquipoExcluidoF15(r.Constructor.name)) {
                                if (r.Driver.driverId === driverId) {
                                    posF15S = ps + 1;
                                    if (ps < PUNTOS_SPRINT.length) ptsF15S = PUNTOS_SPRINT[ps];
                                    break;
                                }
                                ps++;
                            }
                        }
                        const posClassS = posS===1?'p1':posS===2?'p2':posS===3?'p3':'';
                        sprintFila = `<tr class="mtt-sprint">
                            <td class="mtt-pos ${posClassS}">${posS}</td>
                            <td class="mtt-gp"><span class="mtt-sub">↳ Sprint</span></td>
                            <td style="color:#4b5563;font-size:0.75rem;">${resS.Constructor.name}</td>
                            <td class="mtt-pts-f1">${parseFloat(resS.points)||'-'}</td>
                            <td class="mtt-pos ${posF15S===1?'p1':posF15S===2?'p2':posF15S===3?'p3':''}">${posF15S}</td>
                            <td class="mtt-pts">${ptsF15S||'-'}</td>
                        </tr>`;
                    }
                }

                const posClass = posF1num===1?'p1':posF1num===2?'p2':posF1num===3?'p3':'';
                const posF15class = posF15car===1?'p1':posF15car===2?'p2':posF15car===3?'p3':'';
                const filaCeldas = esExcluidoF15
                    ? `<td class="mtt-pos ${posClass} ${esDNF?'mtt-dnf':''}">${esDNF ? 'DNF' : resF1.position}</td>
                       <td class="mtt-gp">GP ${carrera.raceName}<span class="mtt-sub">R${carrera.round} · ${carrera.Circuit?.Location?.country||''}</span></td>
                       <td style="color:#6b7280;font-size:0.78rem;">${resF1.Constructor.name}</td>
                       <td class="mtt-pts-f1">${ptsF1car||'-'}</td>
                       <td style="color:#4b5563;font-size:0.75rem;">${resF1.status||'-'}</td>`
                    : `<td class="mtt-pos ${posClass} ${esDNF?'mtt-dnf':''}">${esDNF ? 'DNF' : resF1.position}</td>
                       <td class="mtt-gp">GP ${carrera.raceName}<span class="mtt-sub">R${carrera.round} · ${carrera.Circuit?.Location?.country||''}</span></td>
                       <td style="color:#6b7280;font-size:0.78rem;">${resF1.Constructor.name}</td>
                       <td class="mtt-pts-f1">${ptsF1car||'-'}</td>
                       <td class="mtt-pos ${posF15class}">${posF15car}</td>
                       <td class="mtt-pts">${ptsF15car||'-'}</td>`;
                filas += `${sprintFila}<tr>${filaCeldas}</tr>`;
            }

            document.getElementById('mtp-tabla-body').innerHTML = filas || '<tr><td colspan="6" class="loading-placeholder">Sin resultados disponibles.</td></tr>';
        }

        // INICIALIZACIÓN DE PROCESOS
        administrarVisitas();
        cargarDatosLive();
        setInterval(() => {
            if (anioActual === "current") cargarDatosLive();
        }, 300000);
