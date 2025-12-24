const { DefinePlugin } = require("webpack")
const dxfViewerPackageJson = require("dxf-viewer/package.json")

module.exports = {
    publicPath: "/",
    transpileDependencies: [
        /[\\\/]node_modules[\\\/]dxf-viewer[\\\/]/
    ],
    devServer: {
        port: 9001,
        host: '0.0.0.0',
        allowedHosts: 'all',
        client: {
            webSocketURL: 'auto://0.0.0.0:0/ws'
        }
    },
    configureWebpack: {
        plugins: [
            new DefinePlugin({
                "DXF_VIEWER_VERSION": JSON.stringify(dxfViewerPackageJson.version)
            })
        ],
        module: {
            rules: [
                {
                    test: /\.worker\.js$/,
                    use: { loader: 'worker-loader' }
                }
            ]
        }
    }
}
