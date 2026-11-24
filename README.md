# Section24 Rover Web

This dashboard uses the [Section24 Rover API](https://github.com/diwakar1218/section24RoverApi). Select `local` or `server` in `api_base_url.json` to connect it to your API. Keep `NEXT_PUBLIC_API_URL` empty to use the web server’s login and API proxy.

```sh
npm ci
npm run dev -- --port 3002
```

Sign in at `http://127.0.0.1:3002/login` using an account from the configured API. Optional map settings go in `.env.local` using `.env.example` as a template.

```sh
npm run build
npm run start -- --port 3002
```
