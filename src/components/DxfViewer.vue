<template>
<div class="canvasContainer" ref="canvasContainer"
     @click="onCanvasClick"
     @mousedown="onCanvasMouseDown"
     @mousemove="onCanvasMouseMove"
     @mouseup="onCanvasMouseUp">
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
            selectedObject: null,
            isDragging: false,
            dragStart: null,
            dragEnd: null
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

        isValidGeometry(object) {
            if (!object || !object.geometry) return false
            if (!object.geometry.attributes || !object.geometry.attributes.position) return false

            const positions = object.geometry.attributes.position.array
            if (!positions || positions.length === 0) return false

            for (let i = 0; i < positions.length; i++) {
                if (!isFinite(positions[i])) {
                    return false
                }
            }

            return true
        },

        getValidSceneObjects(scene) {
            const validObjects = []

            scene.traverse((object) => {
                if (this.isValidGeometry(object)) {
                    console.log('Valid object type:', object.type, 'name:', object.name, 'vertices:', object.geometry.attributes.position.count)
                    validObjects.push(object)
                }
            })

            return validObjects
        },

        onCanvasClick(event) {
            if (this.activeTool === 'select' || !this.dxfViewer) return
            if (this.activeTool === 'region') return

            console.log('=== Click detected with tool:', this.activeTool, '===')

            const rect = this.$refs.canvasContainer.getBoundingClientRect()
            const mouse = {
                x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
                y: -((event.clientY - rect.top) / rect.height) * 2 + 1
            }

            if (!this.raycaster) {
                this.raycaster = new three.Raycaster()
            }

            const camera = this.dxfViewer.GetCamera()
            const scene = this.dxfViewer.GetScene()

            const cameraDistance = camera.position.length()
            const threshold = Math.max(cameraDistance * 0.05, 10)

            this.raycaster.params.Line = { threshold }
            this.raycaster.params.Line2 = { threshold }
            this.raycaster.params.Points = { threshold }

            console.log('Camera distance:', cameraDistance, 'Threshold:', threshold)

            const validObjects = this.getValidSceneObjects(scene)
            console.log('Valid objects in scene:', validObjects.length)

            this.raycaster.setFromCamera(new three.Vector2(mouse.x, mouse.y), camera)

            let intersects = []
            try {
                intersects = this.raycaster.intersectObjects(validObjects, true)
            } catch (error) {
                console.warn('Raycaster error:', error)
                return
            }

            console.log('Intersections found:', intersects.length)

            if (intersects.length > 0) {
                for (let i = 0; i < intersects.length; i++) {
                    const intersect = intersects[i]
                    const object = intersect.object

                    console.log(`--- Checking intersection ${i + 1}/${intersects.length} ---`)

                    try {
                        const dimensions = this.extractDimensions(object, intersect)

                        if (dimensions) {
                            console.log('Extracted dimensions:', dimensions)
                            console.log('Tool matches:', this.matchesTool(dimensions.type))

                            if (this.matchesTool(dimensions.type)) {
                                this.clearSelection()
                                this.highlightObject(object)
                                this.$emit('entity-selected', dimensions)
                                console.log('=== Selection successful ===')
                                return
                            }
                        }
                    } catch (error) {
                        console.warn('Error extracting dimensions:', error)
                    }
                }
            }

            console.log('=== No valid selection ===')
            this.clearSelection()
            this.$emit('entity-selected', null)
        },

        onCanvasMouseDown(event) {
            if (this.activeTool !== 'region' || !this.dxfViewer) return

            this.isDragging = true
            const rect = this.$refs.canvasContainer.getBoundingClientRect()
            this.dragStart = {
                x: event.clientX - rect.left,
                y: event.clientY - rect.top
            }
            this.dragEnd = { ...this.dragStart }

            this.clearSelection()
        },

        onCanvasMouseMove(event) {
            if (!this.isDragging || this.activeTool !== 'region') return

            const rect = this.$refs.canvasContainer.getBoundingClientRect()
            this.dragEnd = {
                x: event.clientX - rect.left,
                y: event.clientY - rect.top
            }

            this.drawSelectionBox()
        },

        onCanvasMouseUp(event) {
            if (!this.isDragging || this.activeTool !== 'region') return

            this.isDragging = false
            this.removeSelectionBox()

            const rect = this.$refs.canvasContainer.getBoundingClientRect()
            const dragEnd = {
                x: event.clientX - rect.left,
                y: event.clientY - rect.top
            }

            const dx = Math.abs(dragEnd.x - this.dragStart.x)
            const dy = Math.abs(dragEnd.y - this.dragStart.y)

            if (dx < 5 && dy < 5) {
                this.$emit('entity-selected', null)
                return
            }

            this.selectObjectsInBox(this.dragStart, dragEnd, rect)
        },

        drawSelectionBox() {
            this.removeSelectionBox()

            if (!this.$refs.canvasContainer) return

            const box = document.createElement('div')
            box.id = 'selection-box'
            box.style.position = 'absolute'
            box.style.border = '2px dashed #2196f3'
            box.style.backgroundColor = 'rgba(33, 150, 243, 0.1)'
            box.style.pointerEvents = 'none'
            box.style.zIndex = '1000'

            const minX = Math.min(this.dragStart.x, this.dragEnd.x)
            const minY = Math.min(this.dragStart.y, this.dragEnd.y)
            const width = Math.abs(this.dragEnd.x - this.dragStart.x)
            const height = Math.abs(this.dragEnd.y - this.dragStart.y)

            box.style.left = minX + 'px'
            box.style.top = minY + 'px'
            box.style.width = width + 'px'
            box.style.height = height + 'px'

            this.$refs.canvasContainer.appendChild(box)
        },

        removeSelectionBox() {
            const box = document.getElementById('selection-box')
            if (box) {
                box.remove()
            }
        },

        selectObjectsInBox(start, end, rect) {
            const camera = this.dxfViewer.GetCamera()
            const scene = this.dxfViewer.GetScene()

            const minX = Math.min(start.x, end.x)
            const maxX = Math.max(start.x, end.x)
            const minY = Math.min(start.y, end.y)
            const maxY = Math.max(start.y, end.y)

            const minNDC = {
                x: (minX / rect.width) * 2 - 1,
                y: -(maxY / rect.height) * 2 + 1
            }
            const maxNDC = {
                x: (maxX / rect.width) * 2 - 1,
                y: -(minY / rect.height) * 2 + 1
            }

            const validObjects = this.getValidSceneObjects(scene)
            const selectedObjects = []

            for (const object of validObjects) {
                if (!object.geometry || !object.geometry.attributes.position) continue

                const positions = object.geometry.attributes.position.array
                const numVertices = positions.length / 3

                let inBox = false
                for (let i = 0; i < numVertices; i++) {
                    const vertex = new three.Vector3(
                        positions[i * 3],
                        positions[i * 3 + 1],
                        positions[i * 3 + 2]
                    )

                    vertex.project(camera)

                    if (vertex.x >= minNDC.x && vertex.x <= maxNDC.x &&
                        vertex.y >= minNDC.y && vertex.y <= maxNDC.y) {
                        inBox = true
                        break
                    }
                }

                if (inBox) {
                    selectedObjects.push(object)
                }
            }

            console.log('Objects in selection box:', selectedObjects.length)

            if (selectedObjects.length > 0) {
                const contour = this.extractContourFromObjects(selectedObjects)
                if (contour) {
                    this.clearSelection()
                    for (const obj of selectedObjects) {
                        this.highlightObject(obj)
                    }
                    this.selectedObject = selectedObjects
                    this.$emit('entity-selected', contour)
                }
            } else {
                this.$emit('entity-selected', null)
            }
        },

        extractContourFromObjects(objects) {
            const allPoints = []

            for (const object of objects) {
                if (!object.geometry || !object.geometry.attributes.position) continue

                const positions = object.geometry.attributes.position.array
                const numVertices = positions.length / 3

                for (let i = 0; i < numVertices; i++) {
                    allPoints.push({
                        x: positions[i * 3],
                        y: positions[i * 3 + 1],
                        z: positions[i * 3 + 2]
                    })
                }
            }

            if (allPoints.length === 0) return null

            const xCoords = allPoints.map(p => p.x)
            const yCoords = allPoints.map(p => p.y)

            const minX = Math.min(...xCoords)
            const maxX = Math.max(...xCoords)
            const minY = Math.min(...yCoords)
            const maxY = Math.max(...yCoords)

            const width = maxX - minX
            const height = maxY - minY

            if (width <= 0 || height <= 0) return null

            return {
                type: 'region',
                width,
                height,
                area: width * height,
                perimeter: 2 * (width + height),
                center: {
                    x: (minX + maxX) / 2,
                    y: (minY + maxY) / 2
                },
                objectCount: objects.length,
                layer: objects[0].userData?.layer || 'Multiple',
                color: '#' + (objects[0].material?.color?.getHexString() || '000000')
            }
        },

        matchesTool(entityType) {
            if (this.activeTool === 'line' && entityType === 'line') return true
            if (this.activeTool === 'hole' && entityType === 'circle') return true
            if (this.activeTool === 'region' && entityType === 'region') return true
            return false
        },

        extractDimensions(object, intersection) {
            if (!object || !object.geometry) {
                console.log('No object or geometry')
                return null
            }

            const geometry = object.geometry
            const userData = object.userData || {}

            if (!geometry.attributes || !geometry.attributes.position) {
                console.log('No position attribute')
                return null
            }

            const positions = geometry.attributes.position.array
            if (!positions || positions.length === 0) {
                console.log('No positions or empty array')
                return null
            }

            console.log('Processing object with', positions.length / 3, 'vertices')

            const numVertices = positions.length / 3
            const validPositions = []

            for (let i = 0; i < numVertices; i++) {
                const x = positions[i * 3]
                const y = positions[i * 3 + 1]
                const z = positions[i * 3 + 2]

                if (isFinite(x) && isFinite(y) && isFinite(z)) {
                    validPositions.push({ x, y, z })
                }
            }

            console.log('Valid positions:', validPositions.length, 'out of', numVertices)

            if (validPositions.length === 0) {
                console.log('No valid positions found')
                return null
            }

            if (validPositions.length === 2) {
                const start = validPositions[0]
                const end = validPositions[1]
                const dx = end.x - start.x
                const dy = end.y - start.y
                const dz = end.z - start.z
                const length = Math.sqrt(dx * dx + dy * dy + dz * dz)

                console.log('Line detected - start:', start, 'end:', end, 'length:', length)

                if (isFinite(length) && length > 0) {
                    return {
                        type: 'line',
                        start: { x: start.x, y: start.y },
                        end: { x: end.x, y: end.y },
                        length,
                        layer: userData.layer || 'Unknown',
                        color: '#' + (object.material?.color?.getHexString() || '000000')
                    }
                }
            }

            const xCoords = validPositions.map(p => p.x)
            const yCoords = validPositions.map(p => p.y)

            const minX = Math.min(...xCoords)
            const maxX = Math.max(...xCoords)
            const minY = Math.min(...yCoords)
            const maxY = Math.max(...yCoords)

            const width = maxX - minX
            const height = maxY - minY
            const centerX = (minX + maxX) / 2
            const centerY = (minY + maxY) / 2

            console.log('Bounds - width:', width, 'height:', height, 'center:', centerX, centerY)

            if (!isFinite(width) || !isFinite(height) || width <= 0 || height <= 0) {
                console.log('Invalid dimensions')
                return null
            }

            if (Math.abs(width - height) / Math.max(width, height) < 0.1) {
                const radius = (width + height) / 4
                console.log('Circle detected - radius:', radius)
                if (isFinite(radius) && radius > 0) {
                    return {
                        type: 'circle',
                        center: { x: centerX, y: centerY },
                        radius,
                        diameter: radius * 2,
                        circumference: 2 * Math.PI * radius,
                        area: Math.PI * radius * radius,
                        layer: userData.layer || 'Unknown',
                        color: '#' + (object.material?.color?.getHexString() || '000000')
                    }
                }
            }

            if (width > 0 && height > 0 && validPositions.length >= 4) {
                console.log('Region detected')
                return {
                    type: 'region',
                    width,
                    height,
                    area: width * height,
                    perimeter: 2 * (width + height),
                    center: { x: centerX, y: centerY },
                    layer: userData.layer || 'Unknown',
                    color: '#' + (object.material?.color?.getHexString() || '000000')
                }
            }

            console.log('No match for any entity type')
            return null
        },

        highlightObject(object) {
            if (!object || !object.material) return

            this.selectedObject = object

            if (!object.userData) {
                object.userData = {}
            }

            if (object.material.color) {
                object.userData.originalColor = object.material.color.clone()
                object.material.color.set(0xff6600)
                object.material.needsUpdate = true
            }

            if (object.material.linewidth !== undefined) {
                object.userData.originalLinewidth = object.material.linewidth
                object.material.linewidth = 3
                object.material.needsUpdate = true
            }
        },

        clearSelection() {
            this.removeSelectionBox()

            if (!this.selectedObject) return

            const objects = Array.isArray(this.selectedObject) ? this.selectedObject : [this.selectedObject]

            for (const obj of objects) {
                try {
                    if (obj && obj.material) {
                        if (obj.userData?.originalColor) {
                            obj.material.color.copy(obj.userData.originalColor)
                            delete obj.userData.originalColor
                        }
                        if (obj.userData?.originalLinewidth !== undefined) {
                            obj.material.linewidth = obj.userData.originalLinewidth
                            delete obj.userData.originalLinewidth
                        }
                        obj.material.needsUpdate = true
                    }
                } catch (error) {
                    console.warn('Error clearing selection:', error)
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
