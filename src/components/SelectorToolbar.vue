<template>
  <div class="selector-toolbar">
    <q-btn-group flat>
      <q-btn
        :flat="activeTool !== 'select'"
        :color="activeTool === 'select' ? 'primary' : 'grey-7'"
        icon="pan_tool"
        @click="selectTool('select')"
      >
        <q-tooltip>Select Tool</q-tooltip>
      </q-btn>
      <q-btn
        :flat="activeTool !== 'line'"
        :color="activeTool === 'line' ? 'primary' : 'grey-7'"
        icon="timeline"
        @click="selectTool('line')"
      >
        <q-tooltip>Line Selector</q-tooltip>
      </q-btn>
      <q-btn
        :flat="activeTool !== 'hole'"
        :color="activeTool === 'hole' ? 'primary' : 'grey-7'"
        icon="radio_button_unchecked"
        @click="selectTool('hole')"
      >
        <q-tooltip>Hole/Circle Selector</q-tooltip>
      </q-btn>
      <q-btn
        :flat="activeTool !== 'region'"
        :color="activeTool === 'region' ? 'primary' : 'grey-7'"
        icon="crop_square"
        @click="selectTool('region')"
      >
        <q-tooltip>Region Selector</q-tooltip>
      </q-btn>
    </q-btn-group>
  </div>
</template>

<script>
export default {
  name: "SelectorToolbar",

  props: {
    activeTool: {
      type: String,
      default: 'select'
    }
  },

  methods: {
    selectTool(tool) {
      this.$emit('tool-selected', tool)
    }
  }
}
</script>

<style scoped lang="less">
.selector-toolbar {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 100;
  background: white;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  padding: 4px;
}
</style>
