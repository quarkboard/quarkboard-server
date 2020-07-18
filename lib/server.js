const fs = require('fs');
const path = require('path');

const Plugin = require('@quarkboard/quarkboard-plugin');
const express = require('express');
const helmet = require('helmet');
const { JSDOM } = require('jsdom');

class Server extends Plugin {
    /**
     * Initialize the plugin and configure the back-end server.
     */
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
                } else
                    this._server = require('http').Server(this._express);

                this._server.listen(opts.port, opts.hostname, () => {
                    this.app.info(`Listening on http${opts.https ? 's' : ''}://${opts.hostname}:${opts.port}/`);

                    if (opts.https) {
                        this.app.debug(`Using private key from ${opts.privateKey}`);
                        this.app.debug(`Using certificate from ${opts.certificate}`);
                    }
                });

                this._express.get('/*', (req, res, next) => {
                    res.header('X-Quarkboard-Version', this.app.packageJson.version);
                    res.header('X-Quarkboard-Repository', this.app.packageJson.repository);
                    next();
                });

                const templateName = path.join(this.app.assetsRoot, this.app.options.template);
                const template = fs.readFileSync(`${templateName}.html`, {encoding: 'utf8'});

                // Make the plugin assets available via express
                this.app.plugins.forEach(plugin => {
                    const pluginName = plugin._config.pluginName;
                    Object.keys(plugin.directories).forEach(key => {
                        const directory = plugin.directories[key];
                        this._express.use(`/${pluginName}/${key}`, express.static(directory));
                    });
                });

                this._express.get('/', (req, res, next) => {
                    const dom = new JSDOM(template);

                    this.app.plugins.filter((plugin) => plugin.enabled).forEach(plugin => {
                        this.app.emit('server-html', plugin, dom.window.document, dom.window);
                        plugin.html(dom.window.document, dom.window);

                        this.app.emit('server-scripts', plugin, dom.window.document);
                        this._parseFiles(dom.window.document, plugin.scripts(), `/${plugin.name}/js`);

                        this.app.emit('server-styles', plugin, dom.window.document);
                        this._parseFiles(dom.window.document, plugin.styles(), `/${plugin.name}/css`);
                    });

                    res.send(dom.serialize());
                    next();
                });
            }
        });
    }

    /**
     * Parse the {files} array and add them to {document}.
     * @param document
     * @param files
     * @param fileRoot
     *
     * @returns {Server}
     * @private
     */
    _parseFiles(document, files, fileRoot) {
        files.forEach(file => {
            let tag;
            let container;

            switch (path.basename(fileRoot)) {
                case 'js':
                    tag = document.createElement('script');
                    tag.src = `${fileRoot}/${file}`;
                    tag.type = 'application/javascript';

                    container = document.body;
                    break;
                case 'css':
                    tag = document.createElement('link');
                    tag.href = `${fileRoot}/${file}`;

                    container = document.head;
                    break;
            }

            container.appendChild(tag);
        });

        return this;
    }

    /**
     * Pass-through for adding ExpressJS middleware.
     *
     * @param callback
     * @param args
     */
    use(callback, ...args) {
        this._express.use(callback, ...args);
    }
}

module.exports = Server;
