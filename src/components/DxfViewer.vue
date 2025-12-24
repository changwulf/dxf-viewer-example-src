<template>
<div class="canvasContainer" ref="canvasContainer" @click="onCanvasClick">
    <q-inner-loading :showing="isLoading" color="primary" style="z-index: 10"/>
    <div v-if="progress !== null" class="progress">
        <q-linear-progress color="primary" :indeterminate="progress < 0" :value="progress" />
        <div v-if="progressText !== null" class="progressText">{{progressText}}</div>
    </div>
    <div v-if="error !== null" class="error" :title="error">
        <q-icon name="warning" class="text-red" style="font-size: 4rem;" /> Error occurred: {{error}}
    </div>
</div>
</template>

<script>
import {DxfViewer} from "dxf-viewer"
import * as three from "three"
import DxfViewerWorker from "worker-loader!./DxfViewerWorker"

/** Events: all DxfViewer supported events (see DxfViewer.Subscribe()), prefixed with "dxf-". */
export default {
    name: "DxfViewer",

    props: {
        dxfUrl: {
            default: null
        },
        fonts: {
            default: null
        },
        options: {
            default() {
                return {
                    clearColor: new three.Color("#fff"),
                    autoResize: true,
                    colorCorrection: true,
                    sceneOptions: {
                        wireframeMesh: true
                    }
                }
            }
        },
        activeTool: {
            type: String,
            default: 'select'
        }
    },

    data() {
        return {
            isLoading: false,
            progress: null,
            progressText: null,
            curProgressPhase: null,
            error: null,
            raycaster: null,
            selectedObject: null
        }
    },

    watch: {
        async dxfUrl(dxfUrl) {
            if (dxfUrl !== null) {
                await this.Load(dxfUrl)
            } else {
                this.dxfViewer.Clear()
                this.error = null
                this.isLoading = false
                this.progress = null
            }
        }
    },

    methods: {
        async Load(url) {
            this.isLoading = true
            this.error = null
            try {
                await this.dxfViewer.Load({
                    url,
                    fonts: this.fonts,
                    progressCbk: this._OnProgress.bind(this),
                    workerFactory: DxfViewerWorker
                })
            } catch (error) {
                console.warn(error)
                this.error = error.toString()
            } finally {
                this.isLoading = false
                this.progressText = null
                this.progress = null
                this.curProgressPhase = null
            }
        },

        /** @return {DxfViewer} */
        GetViewer() {
            return this.dxfViewer
        },

        _OnProgress(phase, size, totalSize) {
            if (phase !== this.curProgressPhase) {
                switch(phase) {
                case "font":
                    this.progressText = "Fetching fonts..."
                    break
                case "fetch":
                    this.progressText = "Fetching file..."
                    break
                case "parse":
                    this.progressText = "Parsing file..."
                    break
                case "prepare":
                    this.progressText = "Preparing rendering data..."
                    break
                }
                this.curProgressPhase = phase
            }
            if (totalSize === null) {
                this.progress = -1
            } else {
                this.progress = size / totalSize
            }
        },

        onCanvasClick(event) {
            if (this.activeTool === 'select' || !this.dxfViewer) return

            const rect = this.$refs.canvasContainer.getBoundingClientRect()
            const x = ((event.clientX - rect.left) / rect.width) * 2 - 1
            const y = -((event.clientY - rect.top) / rect.height) * 2 + 1

            if (!this.raycaster) {
                this.raycaster = new three.Raycaster()
                this.raycaster.params.Line.threshold = 0.5
            }

            const camera = this.dxfViewer.GetCamera()
            const scene = this.dxfViewer.GetScene()

            this.raycaster.setFromCamera(new three.Vector2(x, y), camera)
            const intersects = this.raycaster.intersectObjects(scene.children, true)

            if (intersects.length > 0) {
                this.clearSelection()
                const object = intersects[0].object
                const dimensions = this.extractDimensions(object, intersects[0])

                if (dimensions && this.matchesTool(dimensions.type)) {
                    this.highlightObject(object)
                    this.$emit('entity-selected', dimensions)
                }
            } else {
                this.clearSelection()
                this.$emit('entity-selected', null)
            }
        },

        matchesTool(entityType) {
            if (this.activeTool === 'line' && entityType === 'line') return true
            if (this.activeTool === 'hole' && entityType === 'circle') return true
            if (this.activeTool === 'region' && entityType === 'region') return true
            return false
        },

        extractDimensions(object, intersection) {
            const geometry = object.geometry

            if (geometry.type === 'BufferGeometry' && geometry.attributes.position) {
                const positions = geometry.attributes.position.array

                if (geometry.index === null && positions.length === 6) {
                    const start = {
                        x: positions[0],
                        y: positions[1],
                        z: positions[2] || 0
                    }
                    const end = {
                        x: positions[3],
                        y: positions[4],
                        z: positions[5] || 0
                    }
                    const dx = end.x - start.x
                    const dy = end.y - start.y
                    const dz = (end.z || 0) - (start.z || 0)
                    const length = Math.sqrt(dx * dx + dy * dy + dz * dz)

                    return {
                        type: 'line',
                        start,
                        end,
                        length,
                        layer: object.userData?.layer || 'Unknown',
                        color: '#' + (object.material?.color?.getHexString() || '000000')
                    }
                }

                const minX = Math.min(...Array.from({length: positions.length / 3}, (_, i) => positions[i * 3]))
                const maxX = Math.max(...Array.from({length: positions.length / 3}, (_, i) => positions[i * 3]))
                const minY = Math.min(...Array.from({length: positions.length / 3}, (_, i) => positions[i * 3 + 1]))
                const maxY = Math.max(...Array.from({length: positions.length / 3}, (_, i) => positions[i * 3 + 1]))

                const width = maxX - minX
                const height = maxY - minY
                const centerX = (minX + maxX) / 2
                const centerY = (minY + maxY) / 2

                if (width > 0 && height > 0 && Math.abs(width - height) < 0.01) {
                    const radius = width / 2
                    return {
                        type: 'circle',
                        center: { x: centerX, y: centerY },
                        radius,
                        diameter: radius * 2,
                        circumference: 2 * Math.PI * radius,
                        area: Math.PI * radius * radius,
                        layer: object.userData?.layer || 'Unknown',
                        color: '#' + (object.material?.color?.getHexString() || '000000')
                    }
                }

                if (width > 0 && height > 0) {
                    return {
                        type: 'region',
                        width,
                        height,
                        area: width * height,
                        perimeter: 2 * (width + height),
                        center: { x: centerX, y: centerY },
                        layer: object.userData?.layer || 'Unknown',
                        color: '#' + (object.material?.color?.getHexString() || '000000')
                    }
                }
            }

            return null
        },

        highlightObject(object) {
            this.selectedObject = object
            if (object.material) {
                object.userData.originalColor = object.material.color.clone()
                object.material.color.set(0xff6600)
                if (object.material.linewidth !== undefined) {
                    object.userData.originalLinewidth = object.material.linewidth
                    object.material.linewidth = 3
                }
            }
        },

        clearSelection() {
            if (this.selectedObject && this.selectedObject.material) {
                if (this.selectedObject.userData.originalColor) {
                    this.selectedObject.material.color.copy(this.selectedObject.userData.originalColor)
                }
                if (this.selectedObject.userData.originalLinewidth !== undefined) {
                    this.selectedObject.material.linewidth = this.selectedObject.userData.originalLinewidth
                }
            }
            this.selectedObject = null
        }
    },

    mounted() {
        this.dxfViewer = new DxfViewer(this.$refs.canvasContainer, this.options)
        const Subscribe = eventName => {
            this.dxfViewer.Subscribe(eventName, e => this.$emit("dxf-" + eventName, e))
        }
        for (const eventName of ["loaded", "cleared", "destroyed", "resized", "pointerdown",
                                 "pointerup", "viewChanged", "message"]) {
            Subscribe(eventName)
        }
    },

    destroyed() {
        this.dxfViewer.Destroy()
        this.dxfViewer = null
    }
}
</script>

<style scoped lang="less">

.canvasContainer {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 100px;
    min-height: 100px;

    .progress {
        position: absolute;
        z-index: 20;
        width: 90%;
        margin: 20px 5%;

        .progressText {
            margin: 10px 20px;
            font-size: 14px;
            color: #262d33;
            text-align: center;
        }
    }

    .error {
        width: 100%;
        height: 100%;
        position: absolute;
        z-index: 20;
        padding: 30px;

        img {
            width: 24px;
            height: 24px;
            vertical-align: middle;
            margin: 4px;
        }
    }
}

</style>
