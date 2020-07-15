const fs = require('fs');
const Plugin = require('@quarkboard/quarkboard-plugin');
const express = require('express');
const helmet = require('helmet');

class Server extends Plugin {
    init() {
        this._express = express();
        this._server = undefined;

        this.use(helmet());

        this.app.once('plugin-loading', (plugin, opts) => {
            opts.push(['H', 'hostname=HOSTNAME', 'The hostname for the back-end server', 'localhost']);
            opts.push(['P', 'port=PORT', 'The port for the back-end server to listen on', 3074]);
            opts.push(['', 'https', 'Use secure HTTP transport', false]);
            opts.push(['', 'private-key=PATH', 'The path to the HTTP private key']);
            opts.push(['', 'certificate=PATH', 'The path to the HTTP certificate']);
        });

        this.app.once('plugin-loaded', (plugin) => {
            if (this.is(plugin)) {
                const opts = Object.assign({
                    hostname: 'localhost',
                    port: 3074,
                    https: false,
                    privateKey: '',
                    certificate: '',
                }, this.app.getConfig('server', {}), {
                    hostname: this.app.options.hostname,
                    port: this.app.options.port,
                    https: this.app.options.https,
                    privateKey: this.app.options['private-key'],
                    certificate: this.app.options['certificate'],
                });

                if (opts.https) {
                    this._server = require('https').Server({
                        key: fs.readFileSync(opts.privateKey),
                        cert: fs.readFileSync(opts.certificate),
                    }, this._express);
                } else {
                    this._server = require('http').Server(this._express);
                }

                this._server.listen(opts.port, opts.hostname, () => {
                    console.debug(`Listening on http${opts.https ? 's' : ''}://${opts.hostname}:${opts.port}/`);

                    if (opts.https) {
                        console.debug(`Using private key from ${opts.privateKey}`);
                        console.debug(`Using certificate from ${opts.certificate}`);
                    }
                });

                this._express.get('/*', (req, res, next) => {
                    res.header('X-Quarkboard-Version', this.app.getConfig('pjson.version'));
                    res.header('X-Quarkboard-Repository', this.app.getConfig('pjson.repository'));
                    next();
                });

                this._express.get('/', (req, res, next) => {
                    let html = '<html><head></head><body>';
                    this.app._plugins.forEach((plugin) => html += plugin.html());
                    html += '</body></html>';

                    res.send(html);
                    next();
                });
            }
        });
    }

    use(callback, ...args) {
        this._express.use(callback, ...args);
    }
}

module.exports = Server;
