import {
  blueKeys,
  greenKeys,
  redKeys,
  yellowKeys,
} from '@/features/match-records/constants'
import type { BarKey } from '@/features/match-records/types'
import { getContrastColor, getJobColor } from '@/utils/color'
import { buildMatchReport } from '@/features/match-report/buildMatchReport'
import {
  MATCH_REPORT_BAR_COLORS,
  MATCH_REPORT_COLORS,
  MATCH_REPORT_COLUMNS,
  MATCH_REPORT_FILENAME_SUFFIX,
  MATCH_REPORT_FONT_FAMILY,
  MATCH_REPORT_IMAGE_WIDTH,
  MATCH_REPORT_LAYOUT,
  MATCH_REPORT_MAX_CANVAS_AREA,
  MATCH_REPORT_MAX_CANVAS_HEIGHT,
  MATCH_REPORT_MAX_CANVAS_WIDTH,
  MATCH_REPORT_TABLE_WIDTH,
} from '@/features/match-report/constants'
import type {
  MatchReportBarKey,
  MatchReportCanvasLayout,
  MatchReportColumn,
  MatchReportImageResult,
  MatchReportInput,
  MatchReportModel,
  MatchReportRow,
  MatchReportTableLayout,
  MatchReportTeamLayout,
} from '@/features/match-report/types'

const integerFormatter = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 0,
})

function setFont(
  context: CanvasRenderingContext2D,
  size: number,
  weight: 'normal' | '600' | '700' = 'normal',
): void {
  context.font = `${weight} ${size}px ${MATCH_REPORT_FONT_FAMILY}`
}

function getSortColumnOffset(sortKey: string): number {
  let offset = 0
  for (const column of MATCH_REPORT_COLUMNS) {
    if (column.key === sortKey) return offset
    offset += column.width
  }
  throw new Error(`无法生成团队战报：未找到排序字段 ${sortKey}`)
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const paragraphs = String(text).replace(/\r\n?/g, '\n').split('\n')
  const lines: string[] = []

  for (const paragraph of paragraphs) {
    if (!paragraph) {
      lines.push('')
      continue
    }

    let currentLine = ''
    for (const character of Array.from(paragraph)) {
      const candidate = currentLine + character
      if (currentLine && context.measureText(candidate).width > maxWidth) {
        lines.push(currentLine)
        currentLine = character
      } else {
        currentLine = candidate
      }
    }
    lines.push(currentLine)
  }

  return lines.length ? lines : ['']
}

function measureReportLayout(
  report: MatchReportModel,
  context: CanvasRenderingContext2D,
): MatchReportCanvasLayout {
  const { horizontalMargin } = MATCH_REPORT_LAYOUT
  const contentX = horizontalMargin
  const contentWidth = MATCH_REPORT_TABLE_WIDTH
  let cursorY: number = MATCH_REPORT_LAYOUT.topMargin

  const headerTop = cursorY
  const titleTop = cursorY
  cursorY += MATCH_REPORT_LAYOUT.titleLineHeight
  const displayNameTop = cursorY
  cursorY += MATCH_REPORT_LAYOUT.displayNameLineHeight
  const detailsTop = cursorY
  cursorY += MATCH_REPORT_LAYOUT.metadataLineHeight * 2

  setFont(context, MATCH_REPORT_LAYOUT.noteFontSize)
  const noteLabel = '备注：'
  const noteLabelWidth = context.measureText(noteLabel).width
  const noteLabelTop = cursorY
  const noteLinesTop = cursorY
  const noteLines = wrapText(
    context,
    report.metadata.note || '无',
    Math.max(1, contentWidth - noteLabelWidth - MATCH_REPORT_LAYOUT.noteLabelGap),
  )
  cursorY += Math.max(1, noteLines.length) * MATCH_REPORT_LAYOUT.noteLineHeight
  cursorY += MATCH_REPORT_LAYOUT.headerBottomGap

  const header = {
    top: headerTop,
    titleTop,
    displayNameTop,
    detailsTop,
    noteLabelTop,
    noteLinesTop,
    noteLines,
    bottom: cursorY,
  }

  const teamLayouts: MatchReportTeamLayout[] = []
  report.teams.forEach((team, teamIndex) => {
    const teamTop = cursorY
    const bannerTop = cursorY
    cursorY += MATCH_REPORT_LAYOUT.teamBannerHeight
    const tableLayouts: MatchReportTableLayout[] = []

    team.tables.forEach((table, tableIndex) => {
      const tableTop = cursorY
      const titleTopForTable = cursorY
      cursorY += MATCH_REPORT_LAYOUT.tableTitleHeight
      const tableHeaderTop = cursorY
      cursorY += MATCH_REPORT_LAYOUT.tableHeaderHeight
      const bodyTop = cursorY
      const bodyHeight = table.rows.length
        ? table.rows.length * MATCH_REPORT_LAYOUT.rowHeight
        : MATCH_REPORT_LAYOUT.emptyRowHeight
      const bodyBottom = bodyTop + bodyHeight
      cursorY = bodyBottom

      tableLayouts.push({
        table,
        top: tableTop,
        titleTop: titleTopForTable,
        headerTop: tableHeaderTop,
        bodyTop,
        bodyHeight,
        bodyBottom,
        bottom: cursorY,
        sortColumnX: contentX + getSortColumnOffset(table.sortKey),
        sortColumnWidth:
          MATCH_REPORT_COLUMNS.find((column) => column.key === table.sortKey)?.width ?? 0,
      })

      if (tableIndex < team.tables.length - 1) cursorY += MATCH_REPORT_LAYOUT.tableGap
    })

    teamLayouts.push({
      team,
      top: teamTop,
      bannerTop,
      tables: tableLayouts,
      bottom: cursorY,
    })

    if (teamIndex < report.teams.length - 1) cursorY += MATCH_REPORT_LAYOUT.teamGap
  })

  return {
    width: MATCH_REPORT_IMAGE_WIDTH,
    height: Math.ceil(cursorY + MATCH_REPORT_LAYOUT.bottomMargin),
    contentX,
    contentWidth,
    header,
    teams: teamLayouts,
  }
}

function assertSafeCanvasSize(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error('无法生成团队战报：计算出的图片尺寸无效')
  }
  if (
    width > MATCH_REPORT_MAX_CANVAS_WIDTH ||
    height > MATCH_REPORT_MAX_CANVAS_HEIGHT ||
    width * height > MATCH_REPORT_MAX_CANVAS_AREA
  ) {
    throw new Error(
      `无法生成团队战报：图片尺寸 ${width}×${height} 超过浏览器安全上限，请减少单场数据量`,
    )
  }
}

function fitText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (maxWidth <= 0) return ''
  if (context.measureText(text).width <= maxWidth) return text

  const ellipsis = '…'
  if (context.measureText(ellipsis).width > maxWidth) return ''
  const characters = Array.from(text)
  let low = 0
  let high = characters.length

  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    const candidate = `${characters.slice(0, middle).join('')}${ellipsis}`
    if (context.measureText(candidate).width <= maxWidth) low = middle
    else high = middle - 1
  }

  return `${characters.slice(0, low).join('')}${ellipsis}`
}

function drawClippedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  align: 'left' | 'center' | 'right',
  color: string,
): void {
  const padding = MATCH_REPORT_LAYOUT.cellPadding
  const availableWidth = Math.max(0, width - padding * 2)
  const fittedText = fitText(context, text, availableWidth)

  context.save()
  context.beginPath()
  context.rect(x + 1, y + 1, Math.max(0, width - 2), Math.max(0, height - 2))
  context.clip()
  context.fillStyle = color
  context.textBaseline = 'middle'
  context.textAlign = align
  const textX =
    align === 'left' ? x + padding : align === 'right' ? x + width - padding : x + width / 2
  context.fillText(fittedText, textX, y + height / 2)
  context.restore()
}

function formatCellValue(row: MatchReportRow, column: MatchReportColumn): string {
  const value = row[column.key]
  if (column.format === 'text') {
    if (column.key === 'profession_name' && !value) return '未知'
    return value == null || value === '' ? '无' : String(value)
  }

  const numericValue = toDrawableNumber(value)
  if (column.format === 'decimal2') return numericValue.toFixed(2)
  return integerFormatter.format(Math.round(numericValue))
}

function toDrawableNumber(value: unknown): number {
  if (value == null || value === '') return 0
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : 0
}

function getBarColor(key: MatchReportBarKey): string {
  if (redKeys.has(key as BarKey)) return MATCH_REPORT_BAR_COLORS.red
  if (blueKeys.has(key as BarKey)) return MATCH_REPORT_BAR_COLORS.blue
  if (greenKeys.has(key as BarKey)) return MATCH_REPORT_BAR_COLORS.green
  if (yellowKeys.has(key as BarKey)) return MATCH_REPORT_BAR_COLORS.yellow
  return 'rgba(0,0,0,0.12)'
}

function deepenRgba(color: string): string {
  const match = color.match(
    /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/,
  )
  if (!match) return color
  const [, red = '0', green = '0', blue = '0', alpha = '0'] = match
  return `rgba(${red},${green},${blue},${Math.min(0.75, Number(alpha) + 0.14)})`
}

function drawReportHeader(
  context: CanvasRenderingContext2D,
  report: MatchReportModel,
  layout: MatchReportCanvasLayout,
): void {
  const { contentX, contentWidth, header } = layout

  context.fillStyle = MATCH_REPORT_COLORS.title
  context.textBaseline = 'top'
  context.textAlign = 'left'
  setFont(context, MATCH_REPORT_LAYOUT.titleFontSize, '700')
  context.fillText('逆水寒联赛团队战报', contentX, header.titleTop)

  setFont(context, MATCH_REPORT_LAYOUT.displayNameFontSize, '600')
  context.fillText(
    fitText(context, report.metadata.displayName, contentWidth),
    contentX,
    header.displayNameTop,
  )

  context.fillStyle = MATCH_REPORT_COLORS.text
  setFont(context, MATCH_REPORT_LAYOUT.metadataFontSize)
  context.fillText(
    fitText(context, `对阵双方：${report.metadata.matchup}`, contentWidth),
    contentX,
    header.detailsTop,
  )
  context.fillText(
    fitText(
      context,
      `比赛时间：${report.metadata.matchTime}　　本帮结果：${report.metadata.outcomeLabel}`,
      contentWidth,
    ),
    contentX,
    header.detailsTop + MATCH_REPORT_LAYOUT.metadataLineHeight,
  )

  setFont(context, MATCH_REPORT_LAYOUT.noteFontSize)
  context.fillStyle = MATCH_REPORT_COLORS.mutedText
  context.fillText('备注：', contentX, header.noteLabelTop ?? header.detailsTop)
  const noteLabelWidth = context.measureText('备注：').width
  const noteX = contentX + noteLabelWidth + MATCH_REPORT_LAYOUT.noteLabelGap
  header.noteLines.forEach((line, lineIndex) => {
    context.fillText(
      line,
      noteX,
      (header.noteLinesTop ?? header.detailsTop) +
        lineIndex * MATCH_REPORT_LAYOUT.noteLineHeight,
    )
  })

  context.strokeStyle = MATCH_REPORT_COLORS.grid
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(contentX, header.bottom - MATCH_REPORT_LAYOUT.headerBottomGap / 2)
  context.lineTo(contentX + contentWidth, header.bottom - MATCH_REPORT_LAYOUT.headerBottomGap / 2)
  context.stroke()
}

function drawTeamBanner(
  context: CanvasRenderingContext2D,
  teamLayout: MatchReportTeamLayout,
  contentX: number,
  contentWidth: number,
): void {
  context.fillStyle = MATCH_REPORT_COLORS.teamBanner
  context.fillRect(
    contentX,
    teamLayout.bannerTop,
    contentWidth,
    MATCH_REPORT_LAYOUT.teamBannerHeight,
  )
  setFont(context, MATCH_REPORT_LAYOUT.teamBannerFontSize, '700')
  const bannerText =
    `团长：${teamLayout.team.leaderNick}｜参赛人数：${teamLayout.team.participantCount}`
  drawClippedText(
    context,
    bannerText,
    contentX,
    teamLayout.bannerTop,
    contentWidth,
    MATCH_REPORT_LAYOUT.teamBannerHeight,
    'left',
    MATCH_REPORT_COLORS.teamBannerText,
  )
}

function drawTableTitle(
  context: CanvasRenderingContext2D,
  tableLayout: MatchReportTableLayout,
  contentX: number,
  contentWidth: number,
): void {
  context.fillStyle = MATCH_REPORT_COLORS.tableTitle
  context.fillRect(
    contentX,
    tableLayout.titleTop,
    contentWidth,
    MATCH_REPORT_LAYOUT.tableTitleHeight,
  )
  setFont(context, MATCH_REPORT_LAYOUT.tableTitleFontSize, '600')
  drawClippedText(
    context,
    `${tableLayout.table.title}｜按${tableLayout.table.sortLabel}降序`,
    contentX,
    tableLayout.titleTop,
    contentWidth,
    MATCH_REPORT_LAYOUT.tableTitleHeight,
    'left',
    MATCH_REPORT_COLORS.text,
  )
}

function drawTableHeader(
  context: CanvasRenderingContext2D,
  tableLayout: MatchReportTableLayout,
  contentX: number,
): void {
  let cellX = contentX
  setFont(context, MATCH_REPORT_LAYOUT.tableHeaderFontSize, '600')

  for (const column of MATCH_REPORT_COLUMNS) {
    const isSortColumn = column.key === tableLayout.table.sortKey
    context.fillStyle = isSortColumn
      ? MATCH_REPORT_COLORS.sortHeader
      : MATCH_REPORT_COLORS.tableHeader
    context.fillRect(
      cellX,
      tableLayout.headerTop,
      column.width,
      MATCH_REPORT_LAYOUT.tableHeaderHeight,
    )
    drawClippedText(
      context,
      `${column.label}${isSortColumn ? ' ↓' : ''}`,
      cellX,
      tableLayout.headerTop,
      column.width,
      MATCH_REPORT_LAYOUT.tableHeaderHeight,
      'center',
      MATCH_REPORT_COLORS.text,
    )
    cellX += column.width
  }
}

function drawDataBar(
  context: CanvasRenderingContext2D,
  row: MatchReportRow,
  column: MatchReportColumn,
  tableLayout: MatchReportTableLayout,
  x: number,
  y: number,
): void {
  const key = column.barKey
  if (!key) return
  const value = toDrawableNumber(row[key])
  const maximum = tableLayout.table.maxValues[key]
  if (value <= 0 || maximum <= 0) return

  const ratio = Math.max(0, Math.min(1, value / maximum))
  const color = getBarColor(key)
  context.fillStyle =
    column.key === tableLayout.table.sortKey ? deepenRgba(color) : color
  context.fillRect(
    x + 1,
    y + 1,
    Math.max(0, (column.width - 2) * ratio),
    MATCH_REPORT_LAYOUT.rowHeight - 2,
  )
}

function drawDataRows(
  context: CanvasRenderingContext2D,
  tableLayout: MatchReportTableLayout,
  contentX: number,
  contentWidth: number,
): void {
  const { rows } = tableLayout.table
  if (!rows.length) {
    context.fillStyle = MATCH_REPORT_COLORS.emptyRow
    context.fillRect(contentX, tableLayout.bodyTop, contentWidth, tableLayout.bodyHeight)
    setFont(context, MATCH_REPORT_LAYOUT.rowFontSize)
    drawClippedText(
      context,
      tableLayout.table.emptyMessage,
      contentX,
      tableLayout.bodyTop,
      contentWidth,
      tableLayout.bodyHeight,
      'center',
      MATCH_REPORT_COLORS.mutedText,
    )
    return
  }

  rows.forEach((row, rowIndex) => {
    const rowY = tableLayout.bodyTop + rowIndex * MATCH_REPORT_LAYOUT.rowHeight
    context.fillStyle =
      rowIndex % 2 === 0 ? MATCH_REPORT_COLORS.rowEven : MATCH_REPORT_COLORS.rowOdd
    context.fillRect(contentX, rowY, contentWidth, MATCH_REPORT_LAYOUT.rowHeight)
    let cellX = contentX

    for (const column of MATCH_REPORT_COLUMNS) {
      drawDataBar(context, row, column, tableLayout, cellX, rowY)

      let textColor: string = MATCH_REPORT_COLORS.text
      if ('professionColor' in column && column.professionColor && row.profession_name) {
        const professionColor = getJobColor(row.profession_name)
        context.fillStyle = professionColor
        context.fillRect(cellX + 1, rowY + 1, column.width - 2, MATCH_REPORT_LAYOUT.rowHeight - 2)
        textColor = getContrastColor(professionColor)
      }

      setFont(context, MATCH_REPORT_LAYOUT.rowFontSize)
      drawClippedText(
        context,
        formatCellValue(row, column),
        cellX,
        rowY,
        column.width,
        MATCH_REPORT_LAYOUT.rowHeight,
        column.align,
        textColor,
      )
      cellX += column.width
    }
  })
}

function drawTableGrid(
  context: CanvasRenderingContext2D,
  tableLayout: MatchReportTableLayout,
  contentX: number,
  contentWidth: number,
): void {
  context.strokeStyle = MATCH_REPORT_COLORS.grid
  context.lineWidth = MATCH_REPORT_LAYOUT.gridLineWidth
  context.beginPath()
  context.rect(
    contentX + 0.5,
    tableLayout.headerTop + 0.5,
    contentWidth - 1,
    tableLayout.bodyBottom - tableLayout.headerTop - 1,
  )

  let cellX = contentX
  for (const column of MATCH_REPORT_COLUMNS.slice(0, -1)) {
    cellX += column.width
    context.moveTo(cellX + 0.5, tableLayout.headerTop)
    context.lineTo(
      cellX + 0.5,
      tableLayout.table.rows.length ? tableLayout.bodyBottom : tableLayout.bodyTop,
    )
  }

  context.moveTo(contentX, tableLayout.bodyTop + 0.5)
  context.lineTo(contentX + contentWidth, tableLayout.bodyTop + 0.5)
  if (tableLayout.table.rows.length) {
    for (let rowIndex = 1; rowIndex < tableLayout.table.rows.length; rowIndex += 1) {
      const rowY = tableLayout.bodyTop + rowIndex * MATCH_REPORT_LAYOUT.rowHeight
      context.moveTo(contentX, rowY + 0.5)
      context.lineTo(contentX + contentWidth, rowY + 0.5)
    }
  }
  context.stroke()
}

function drawSortColumnBorder(
  context: CanvasRenderingContext2D,
  tableLayout: MatchReportTableLayout,
): void {
  const borderWidth = MATCH_REPORT_LAYOUT.sortBorderWidth
  const halfBorder = borderWidth / 2
  context.save()
  context.strokeStyle = MATCH_REPORT_COLORS.sortBorder
  context.lineWidth = borderWidth
  context.strokeRect(
    tableLayout.sortColumnX + halfBorder,
    tableLayout.headerTop + halfBorder,
    tableLayout.sortColumnWidth - borderWidth,
    tableLayout.bodyBottom - tableLayout.headerTop - borderWidth,
  )
  context.restore()
}

function drawReport(
  context: CanvasRenderingContext2D,
  report: MatchReportModel,
  layout: MatchReportCanvasLayout,
): void {
  context.fillStyle = MATCH_REPORT_COLORS.background
  context.fillRect(0, 0, layout.width, layout.height)
  drawReportHeader(context, report, layout)

  layout.teams.forEach((teamLayout, teamIndex) => {
    drawTeamBanner(context, teamLayout, layout.contentX, layout.contentWidth)

    teamLayout.tables.forEach((tableLayout) => {
      drawTableTitle(context, tableLayout, layout.contentX, layout.contentWidth)
      drawTableHeader(context, tableLayout, layout.contentX)
      drawDataRows(context, tableLayout, layout.contentX, layout.contentWidth)
      drawTableGrid(context, tableLayout, layout.contentX, layout.contentWidth)
      drawSortColumnBorder(context, tableLayout)
    })

    if (teamIndex < layout.teams.length - 1) {
      context.strokeStyle = MATCH_REPORT_COLORS.grid
      context.lineWidth = 2
      context.beginPath()
      context.moveTo(layout.contentX, teamLayout.bottom + MATCH_REPORT_LAYOUT.teamGap / 2)
      context.lineTo(
        layout.contentX + layout.contentWidth,
        teamLayout.bottom + MATCH_REPORT_LAYOUT.teamGap / 2,
      )
      context.stroke()
    }
  })
}

function sanitizeFilename(matchName: string): string {
  const withoutControlCharacters = Array.from(matchName.replace(/\.csv$/i, ''))
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint <= 31 || codePoint === 127 ? '_' : character
    })
    .join('')
  const baseName = withoutControlCharacters
    .replace(/[<>:"/\\|?*%]+/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
  const characters = Array.from(baseName || '联赛')
  return `${characters.slice(0, 120).join('')}${MATCH_REPORT_FILENAME_SUFFIX}`
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('无法生成团队战报：浏览器未能编码 PNG 图片'))
          return
        }
        resolve(blob)
      }, 'image/png')
    } catch (error) {
      reject(
        error instanceof Error
          ? new Error(`无法生成团队战报：PNG 编码失败（${error.message}）`)
          : new Error('无法生成团队战报：PNG 编码失败'),
      )
    }
  })
}

/**
 * Generates a complete PNG in memory. Downloading the returned Blob remains
 * the responsibility of MatchRecords.vue.
 */
export async function generateMatchReportImage(
  input: MatchReportInput,
): Promise<MatchReportImageResult> {
  const report = buildMatchReport(input)

  if (typeof document === 'undefined') {
    throw new Error('无法生成团队战报：当前环境不支持浏览器 Canvas')
  }

  if (document.fonts?.ready) await document.fonts.ready

  // Pass one: use a disposable canvas solely for text measurement and layout.
  const measurementCanvas = document.createElement('canvas')
  const measurementContext = measurementCanvas.getContext('2d')
  if (!measurementContext) {
    throw new Error('无法生成团队战报：浏览器无法创建 Canvas 绘图上下文')
  }
  const layout = measureReportLayout(report, measurementContext)
  assertSafeCanvasSize(layout.width, layout.height)

  // Pass two: create the exact-size output canvas and paint the measured model.
  const canvas = document.createElement('canvas')
  canvas.width = layout.width
  canvas.height = layout.height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('无法生成团队战报：浏览器无法创建 Canvas 绘图上下文')
  }
  drawReport(context, report, layout)

  const blob = await canvasToPngBlob(canvas)
  return {
    blob,
    filename: sanitizeFilename(report.metadata.matchName),
    width: layout.width,
    height: layout.height,
  }
}
