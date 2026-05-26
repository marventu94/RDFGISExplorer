# RDFExplorer

SPARQL visual query builder and RDF explorer.

Angular 17+ standalone application with cytoscape.js graph visualisation.

## Local development

```bash
cd app && npm install && npm start
```

Open http://localhost:4200.

## Production build

```bash
cd app && npm run build
```

The output in `app/dist/app/browser/` is a static SPA — serve it with any web server (Nginx, Caddy, Vercel, Netlify, etc.).

## Custom endpoints

The SPARQL endpoint is configurable from the **Settings** panel (click the gear icon in the toolbar). Supports Virtuoso, Fuseki, and generic SPARQL endpoints.

## Project structure

```
app/         Angular application (src/app/)
SPECS.md     Full feature specification
license.txt  CC-BY-NC-SA 4.0
```

## License

<a rel="license" href="http://creativecommons.org/licenses/by-nc-sa/4.0/"><img alt="Creative Commons License" style="border-width:0" src="https://i.creativecommons.org/l/by-nc-sa/4.0/88x31.png" /></a><br />This work is licensed under a <a rel="license" href="http://creativecommons.org/licenses/by-nc-sa/4.0/">Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License</a>.
