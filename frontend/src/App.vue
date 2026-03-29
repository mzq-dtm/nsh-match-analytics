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

    <div class="footer">
      <div class="footer-section footer-left">{{ footerLeftText }}</div>
      <div class="footer-section footer-center">
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">
          {{ footerCenterICPText }}
        </a>
      </div>
      <div class="footer-section footer-right">
        <a
          class="github-link"
          href="https://github.com/mzq-dtm/nsh-match-analytics"
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub 开源仓库"
          title="GitHub 开源仓库"
        >
          <svg viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M56.7937 84.9688C44.4187 83.4688 35.7 74.5625 35.7 63.0313C35.7 58.3438 37.3875 53.2813 40.2 49.9063C38.9812 46.8125 39.1687 40.25 40.575 37.5313C44.325 37.0625 49.3875 39.0313 52.3875 41.75C55.95 40.625 59.7 40.0625 64.2937 40.0625C68.8875 40.0625 72.6375 40.625 76.0125 41.6563C78.9187 39.0313 84.075 37.0625 87.825 37.5313C89.1375 40.0625 89.325 46.625 88.1062 49.8125C91.1062 53.375 92.7 58.1563 92.7 63.0313C92.7 74.5625 83.9812 83.2813 71.4187 84.875C74.6062 86.9375 76.7625 91.4375 76.7625 96.5938L76.7625 106.344C76.7625 109.156 79.1062 110.75 81.9187 109.625C98.8875 103.156 112.2 86.1875 112.2 65.1875C112.2 38.6563 90.6375 17 64.1062 17C37.575 17 16.2 38.6562 16.2 65.1875C16.2 86 29.4187 103.25 47.2312 109.719C49.7625 110.656 52.2 108.969 52.2 106.438L52.2 98.9375C50.8875 99.5 49.2 99.875 47.7 99.875C41.5125 99.875 37.8562 96.5 35.2312 90.2188C34.2 87.6875 33.075 86.1875 30.9187 85.9063C29.7937 85.8125 29.4187 85.3438 29.4187 84.7813C29.4187 83.6563 31.2937 82.8125 33.1687 82.8125C35.8875 82.8125 38.2312 84.5 40.6687 87.9688C42.5437 90.6875 44.5125 91.9063 46.8562 91.9063C49.2 91.9063 50.7 91.0625 52.8562 88.9063C54.45 87.3125 55.6687 85.9063 56.7937 84.9688Z" fill="black"/>
          </svg>
        </a>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const footerLeftText: string = '公会名字 2026'
const footerCenterICPText: string = ''  // '某ICP备XXXXXXXXXX号'

const tabs = [
  { to: '/match', label: '联赛数据' },
  { to: '/attendance', label: '帮众出勤分析' },
  { to: '/player-history', label: '帮众数据查询' },
  { to: '/match-configurator', label: '联赛团队配置' },
  { to: '/help', label: '使用帮助' },
]
</script>

<style>
html,
body {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
}

#app {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: 100%;
  padding: 0;
  overflow: hidden;
}

.tab-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  flex: 1 1 0%;
  min-height: 0;
  background: #fff;
  border: 2px solid #ddd;
  box-sizing: border-box;
  overflow: hidden;
}

.tab-header {
  display: flex;
  background: #f0f0f0;
}

.tab-item {
  display: block;
  flex: 1;
  padding: 0.75rem;
  text-align: center;
  cursor: pointer;
  font-size: 1.1rem;
  transition: background 0.2s;
  border: 1px solid #ddd;
  color: inherit;
  text-decoration: none;
}

.tab-item:hover {
  background: #e2e2e2;
}

.tab-item.active {
  background: #fff;
  border-bottom: 3px solid #42b983;
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

.footer {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  width: 100%;
  padding: 0.1rem 1rem;
  box-sizing: border-box;
  border-top: 1px solid #ddd;
  background: #fafafa;
  color: #666;
  font-size: 0.9rem;
}

.footer-section {
  min-width: 0;
}

.footer-left {
  justify-self: start;
}

.footer-center {
  justify-self: center;
}

.footer-right {
  justify-self: end;
}

.footer a {
  color: inherit;
  text-decoration: none;
}

.footer a:hover {
  color: #222;
}

.github-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
}

.github-link svg {
  width: 100%;
  height: 100%;
}

.controls select {
  margin-left: 0.5rem;
  padding: 0.4rem 0.6rem;
  font-size: 1rem;
}

.results th,
.results td {
  border: 1px solid #eee;
  padding: 0.6rem;
  text-align: center;
  white-space: nowrap;
  font-family: 'Courier New', Courier, monospace;
  font-weight: bold;
}

.results th {
  cursor: pointer;
}

.results thead {
  background: #fafafa;
  font-weight: bold;
}

.empty,
.dev-placeholder {
  padding: 2rem;
  text-align: center;
  color: #888;
}
</style>
