# examples/

- `sample-apify.json` — dataset Apify (Google Maps scrape) de muestra con 5 rows que ejercitan todos los filtros de Fase 1 (`has_website`, `missing_name`, `permanently_closed`, `insufficient_data`, dedup). Útil para probar `aureus ingest --dry-run`.
- `cartagena-restaurants.plan.json` — ejemplo de plan generado por el meta-prompt orquestador (`agents/orchestrator.md`) para el objetivo *"40 sitios para restaurantes en Cartagena en 18 días"*. Ilustrativo; un plan real se genera pegando el meta-prompt + objetivo en un LLM.

## Probar el dataset

```bash
pnpm aureus ingest examples/sample-apify.json --dry-run
# → reporta descartes sin tocar el state
```

Salida esperada (5 rows):
- 1 `has_website` (Sazón Cartagena)
- 1 `permanently_closed` (Café San Roque)
- 3 aceptados (Don Luigi, El Rincón, Arepas La Esquina)
