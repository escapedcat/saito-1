# Blockchain Explorer in Vue.js


## Setup
```
npm install
```

## Dev workflow
1. Run saito on `http://localhost:12101`
1. Start app:
    ```
    npm start
    ```
1. Open: `http://localhost:9000`


## Build and test dist against saito
1. Create `dist` build:
    ```
    npm run build:dev
    ```
1. Run saito on `http://localhost:12101`
1. Open blockchain explorer `http://localhost:12101/explorer-refactor`

### Known issues
1. SPA breaks on reload because express needs to forward all routes/URLs


## Config information

### ENV settings
`./config-env/`  
From this folder `env.js` will be copied/used depending on environment.  
At the moment only `dev` and `dist` are used:
- `dev` is used for what is described in [dev workflow](#dev-workflow)
- `dist` is used for result of a [dist build](#build-and–test–dist-against-saito)

### Webpack
`./webpack.config.js`  
`publicPath` default is `/` but is being overwritten if `PUBLIC_PATH` environment variable is set.
