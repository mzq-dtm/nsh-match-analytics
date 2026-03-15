<template>
  <div id="app">
    <div class="tab-container">
      <div class="tab-header">
        <RouterLink
          v-for="tab in tabs"
          :key="tab.to"
          :to="tab.to"
          class="tab-item"
          active-class="active"
        >
          {{ tab.label }}
        </RouterLink>
      </div>
      <div class="tab-content">
        <RouterView v-slot="{ Component }">
          <KeepAlive>
            <component :is="Component" class="tab-panel" />
          </KeepAlive>
        </RouterView>
      </div>
    </div>
  </div>
</template>


<script setup>
const tabs = [
  { to: '/match', label: '联赛数据' },
  { to: '/match-visual', label: '联赛数据可视化' },
  { to: '/attendance', label: '帮众出勤分析' },
  { to: '/player-history', label: '帮众数据查询' },
  { to: '/match-configurator', label: '联赛团队配置' },
  { to: '/help', label: '使用帮助' },
]
</script>

<style>
html, body {
  width: 100%; height: 100%;
  margin: 0; padding: 0;
  overflow: hidden;
}
#app {
  display: flex; justify-content: center; align-items: center;
  width: 100%; height: 100%;
  padding: 0;
  overflow: hidden;
}
.tab-container {
  display: flex;
  flex-direction: column;
  width: 99%; height: 99%;
  background: #fff; border: 2px solid #ddd;
  box-sizing: border-box; overflow: hidden;
}
.tab-header {
  display: flex; background: #f0f0f0;
}
.tab-item {
  display: block;
  flex: 1; padding: 0.75rem; text-align: center;
  cursor: pointer; font-size: 1.1rem;
  transition: background 0.2s;
  border: 1px solid #ddd;
  color: inherit;
  text-decoration: none;
}
.tab-item:hover { background: #e2e2e2; }
.tab-item.active {
  background: #fff; border-bottom: 3px solid #42b983;
  font-weight: bold;
}
.tab-content {
  flex: 1;
  padding: 1rem;
  box-sizing: border-box;
  overflow: hidden;
}
.tab-panel {
  width: 100%;
  height: 100%;
}
.controls select {
  margin-left: 0.5rem; padding: 0.4rem 0.6rem;
  font-size: 1rem;
}
.results th,
.results td {
  border: 1px solid #eee;
  padding: 0.6rem;
  text-align: center;
  white-space: nowrap;
  font-family: "Courier New", Courier, monospace;
  font-weight: bold;
}
.results th {
  cursor: pointer;
}
.results thead {
  background: #fafafa; font-weight: bold;
}
.empty,
.dev-placeholder {
  padding: 2rem; text-align: center; color: #888;
}
</style>


