<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <article class="help">
    <header class="help-header">
      <h1>“联赛数据综合管理系统”功能说明</h1>
      <p class="subtitle">开发者：确定型图灵机</p>
    </header>

    <section class="help-content">
      <h2>一、“联赛数据”模块功能说明</h2>
      <p>“联赛数据”模块可以查看每场联赛的本帮与对手战斗数据，以及本帮胜负和比赛备注。选择比赛后可以：</p>
      <ul>
        <li>切换本帮与对手数据，并按全帮、团队或职业查看明细和汇总；</li>
        <li>打开“敌我统计对比”，并排比较双方人数和各项战斗指标；</li>
        <li>使用“自动分析”辅助识别多项核心指标同时偏低的本帮记录。分析对象始终是本帮，结果需要结合职业职责和指挥安排判断；</li>
        <li>当前比赛的明细、胜负和备注加载完成后，使用“导出分团数据”下载本帮团队战报 PNG 长图。当前是否正在查看对手、页面排序、筛选、列显隐和高亮均不影响导出内容。</li>
      </ul>
      <p>团队战报按团队参赛人数降序排列，“未分团”放在最后；每团固定包含非素问的对玩家伤害、对建筑伤害和击杀排名表，以及素问治疗排名表。图片由当前浏览器直接生成并下载，不会上传到服务器；图片包含昵称和战绩，请作为帮会内部资料妥善分享，长图建议使用桌面浏览器导出。</p>
      <p>联赛数据通过交互式表格呈现，表格支持：</p>
      <ul>
        <li>可手动勾选控制表格列是否显示；</li>
        <li>战斗数据支持数据条可视化；</li>
        <li>鼠标左键单击表头可对该列进行排序；</li>
        <li>右键单击表头对该列高亮显示；右键单击序号对该行高亮显示；右键单击单元格对该单元格高亮显示；</li>
        <li>在本帮明细中左键单击玩家 ID 或昵称，可以查看该玩家参与的所有历史联赛数据。</li>
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
        <li>鼠标右键单击成员可以修改成员的职业；</li>
        <li>鼠标左键可在各团队与替补席间拖动帮会成员；</li>
        <li>鼠标悬停在各团顶部名字上可以显示团队职业配置；</li>
        <li>单击左侧“保存图片”按钮生成团队配置图片预览，再通过浏览器保存图片；</li>
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
