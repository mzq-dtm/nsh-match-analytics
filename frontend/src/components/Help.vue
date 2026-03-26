<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <article class="help">
    <header class="help-header">
      <h1>“联赛数据综合管理系统”功能说明</h1>
      <p class="subtitle">开发者：确定型图灵机</p>
    </header>

    <section class="help-content">
      <h2>一、“联赛数据”模块功能说明</h2>
      <p>“联赛数据”模块可以查看每一场联赛所有参与者的战斗数据，包括本帮帮众与对方帮众，同时还会显示联赛胜负信息。联赛数据通过交互式表格的方式呈现。交互式表格支持如下功能：</p>
      <ul>
        <li>可手动勾选控制表格列是否显示；</li>
        <li>战斗数据支持数据条可视化；</li>
        <li>鼠标左键单击表头可对该列进行排序；</li>
        <li>右键单击表头对该列高亮显示；右键单击序号对该行高亮显示；右键单击单元格对该单元格高亮显示；</li>
        <li>左键单击玩家id或玩家昵称可以查看该玩家参与的所有历史联赛数据。</li>
      </ul>

      <h2>二、“帮众出勤分析”模块功能说明</h2>
      <p>“帮众出勤分析”模块展示开始日期与结束日期之间，所有玩家的联赛出勤率情况。具体展示如下数据：</p>
      <ul>
        <li>玩家最近一次联赛参与时的总战力；</li>
        <li>联赛出勤率（不显示出勤次数为0的玩家）；</li>
        <li>首次与最后联赛时间；</li>
        <li>统计区间内的联赛战斗数据汇总。</li>
      </ul>
      <p>“帮众出勤分析”模块中的表格支持：</p>
      <ul>
        <li>鼠标左键单击表头可对该列进行排序；</li>
        <li>左键单击玩家id或玩家昵称可以查看该玩家参与的所有历史联赛数据。</li>
      </ul>

      <h2>三、“帮众数据查询”模块使用说明</h2>
      <p>“帮众数据查询”模块展示一个帮众的所有历史联赛数据。</p>
      <p>首先通过搜索框搜索需要展示历史数据的帮众。搜索框支持关键字、拼音、拼音首字母模糊查找。选择需要展示的帮众后，会展示该帮众所有参与的联赛数据。数据表格支持鼠标左键单击表头进行排序。</p>

      <h2>四、“联赛团队配置”模块使用说明</h2>
      <p>“联赛团队配置”模块方便帮会管理配置各团成员名单。加载帮会成员数据后：</p>
      <ul>
        <li>所有成员默认出现在替补席，可以通过职业和评分筛选替补席成员；</li>
        <li>鼠标悬停在替补席成员上可以速查该玩家最近三次联赛数据；</li>
        <li>鼠标左键可在各团队与替补席间拖动帮会成员；</li>
        <li>鼠标悬停在各团顶部名字上可以显示团队职业配置；</li>
        <li>单击左侧“保存图片”按钮快速将团队配置导出为图片；</li>
        <li>单击左侧“保存表格”按钮快速将团队配置导出为电子表格。</li>
      </ul>
    </section>
  </article>
</template>


<style scoped>
.help {
  height: 100%;
  overflow: auto;
  padding: 0 16px 48px;
  line-height: 1.75;
  color: #222;
  margin: 0;
}

.help-header {
  margin: 8px 0 20px;
  border-bottom: 1px solid #eee;
  padding-bottom: 12px;
}

.help h1 {
  margin: 0 0 6px;
  font-size: 48px;
  font-weight: 700;
}

.subtitle {
  margin: 0 0 8px;
  font-size: 24px;
  color: #888;
}

.help-content h2 {
  font-size: 36px;
  margin: 20px 0 8px;
  padding-left: 10px;
  border-left: 4px solid #e5e5e5;
}

.help-content h3 {
  font-size: 24px;
  margin: 16px 0 6px;
}

.help-content p {
  font-size: 24px;
  margin: 8px 0;
}

.help-content ul,
.help-content ol {
  font-size: 24px;
  padding-left: 20px;
  margin: 8px 0;
}
</style>
