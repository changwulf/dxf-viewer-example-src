const { DefinePlugin } = require("webpack")
const dxfViewerPackageJson = require("dxf-viewer/package.json")

module.exports = {
    publicPath: "/",
    transpileDependencies: [
        /[\\\/]node_modules[\\\/]dxf-viewer[\\\/]/
    ],
    configureWebpack: {
        plugins: [
            new DefinePlugin({
                "DXF_VIEWER_VERSION": JSON.stringify(dxfViewerPackageJson.version)
            })
        ]
    }
}
