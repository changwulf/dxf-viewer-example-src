<template>
  <div v-if="selection" class="dimension-display">
    <div class="dimension-header">
      <q-icon :name="getIcon(selection.type)" size="sm" />
      <span class="dimension-title">{{ getTitle(selection.type) }}</span>
      <q-btn flat dense round size="sm" icon="close" @click="$emit('close')" />
    </div>

    <div class="dimension-content">
      <div v-if="selection.type === 'line'" class="dimension-item">
        <span class="dimension-label">Length:</span>
        <span class="dimension-value">{{ formatNumber(selection.length) }}</span>
      </div>

      <div v-if="selection.type === 'line'" class="dimension-item">
        <span class="dimension-label">Start Point:</span>
        <span class="dimension-value">
          ({{ formatNumber(selection.start.x) }}, {{ formatNumber(selection.start.y) }})
        </span>
      </div>

      <div v-if="selection.type === 'line'" class="dimension-item">
        <span class="dimension-label">End Point:</span>
        <span class="dimension-value">
          ({{ formatNumber(selection.end.x) }}, {{ formatNumber(selection.end.y) }})
        </span>
      </div>

      <div v-if="selection.type === 'circle'" class="dimension-item">
        <span class="dimension-label">Radius:</span>
        <span class="dimension-value">{{ formatNumber(selection.radius) }}</span>
      </div>

      <div v-if="selection.type === 'circle'" class="dimension-item">
        <span class="dimension-label">Diameter:</span>
        <span class="dimension-value">{{ formatNumber(selection.diameter) }}</span>
      </div>

      <div v-if="selection.type === 'circle'" class="dimension-item">
        <span class="dimension-label">Center:</span>
        <span class="dimension-value">
          ({{ formatNumber(selection.center.x) }}, {{ formatNumber(selection.center.y) }})
        </span>
      </div>

      <div v-if="selection.type === 'circle'" class="dimension-item">
        <span class="dimension-label">Circumference:</span>
        <span class="dimension-value">{{ formatNumber(selection.circumference) }}</span>
      </div>

      <div v-if="selection.type === 'circle'" class="dimension-item">
        <span class="dimension-label">Area:</span>
        <span class="dimension-value">{{ formatNumber(selection.area) }}</span>
      </div>

      <div v-if="selection.type === 'region'" class="dimension-item">
        <span class="dimension-label">Width:</span>
        <span class="dimension-value">{{ formatNumber(selection.width) }}</span>
      </div>

      <div v-if="selection.type === 'region'" class="dimension-item">
        <span class="dimension-label">Height:</span>
        <span class="dimension-value">{{ formatNumber(selection.height) }}</span>
      </div>

      <div v-if="selection.type === 'region'" class="dimension-item">
        <span class="dimension-label">Area:</span>
        <span class="dimension-value">{{ formatNumber(selection.area) }}</span>
      </div>

      <div v-if="selection.type === 'region'" class="dimension-item">
        <span class="dimension-label">Perimeter:</span>
        <span class="dimension-value">{{ formatNumber(selection.perimeter) }}</span>
      </div>

      <div v-if="selection.layer" class="dimension-item">
        <span class="dimension-label">Layer:</span>
        <span class="dimension-value">{{ selection.layer }}</span>
      </div>

      <div v-if="selection.color" class="dimension-item">
        <span class="dimension-label">Color:</span>
        <span class="dimension-value">
          <span class="color-badge" :style="{ backgroundColor: selection.color }"></span>
          {{ selection.color }}
        </span>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: "DimensionDisplay",

  props: {
    selection: {
      type: Object,
      default: null
    }
  },

  methods: {
    getTitle(type) {
      const titles = {
        line: 'Line',
        circle: 'Circle/Hole',
        region: 'Region'
      }
      return titles[type] || 'Selected Element'
    },

    getIcon(type) {
      const icons = {
        line: 'timeline',
        circle: 'radio_button_unchecked',
        region: 'crop_square'
      }
      return icons[type] || 'info'
    },

    formatNumber(value) {
      if (typeof value !== 'number') return value
      return value.toFixed(3)
    }
  }
}
</script>

<style scoped lang="less">
.dimension-display {
  position: absolute;
  top: 80px;
  left: 16px;
  z-index: 100;
  background: white;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  min-width: 280px;
  max-width: 400px;

  .dimension-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid #e0e0e0;
    background: #f5f5f5;
    border-radius: 4px 4px 0 0;

    .dimension-title {
      flex: 1;
      font-weight: 600;
      font-size: 14px;
      color: #333;
    }
  }

  .dimension-content {
    padding: 12px 16px;
    max-height: 400px;
    overflow-y: auto;

    .dimension-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid #f0f0f0;

      &:last-child {
        border-bottom: none;
      }

      .dimension-label {
        font-size: 13px;
        color: #666;
        font-weight: 500;
      }

      .dimension-value {
        font-size: 13px;
        color: #333;
        font-family: monospace;
        display: flex;
        align-items: center;
        gap: 8px;

        .color-badge {
          display: inline-block;
          width: 16px;
          height: 16px;
          border-radius: 2px;
          border: 1px solid #ccc;
        }
      }
    }
  }
}
</style>
