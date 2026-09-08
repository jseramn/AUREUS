# state/

Backend JSON de la state machine (default `pipeline.json`). Gitignored salvo ejemplos.

Un fork puede reemplazar el backend por SQLite cambiando únicamente la implementación de `PipelineStore` (ver `orchestration/state-machine.ts`); la interfaz es idéntica a la del proyecto origen.
