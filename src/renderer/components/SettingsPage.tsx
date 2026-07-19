import { useState, useEffect } from 'react'
import {
  Card, Form, Input, InputNumber, Switch, Button, Message,
  Popover, Tag, Divider
} from '@arco-design/web-react'
import { IconQuestionCircle, IconDelete } from '@arco-design/web-react/icon'
import type { AppConfig, ModelPricing } from '../../shared/types'

const FormItem = Form.Item

const defaultConfig: AppConfig = {
  version: '0.1.0',
  workdayStartHour: 5,
  closeToTray: true,
  apiKey: '',
  apiBaseUrl: '',
  feishu: { appId: '', appSecret: '', docFolderToken: '', baseAppToken: '', baseTableId: '' },
  modelPricing: {
    'deepseek-v4-flash': { inputPerMTok: 1.0, cacheHitPerMTok: 0.02, outputPerMTok: 2.0 },
    'deepseek-v4-pro': { inputPerMTok: 7.0, cacheHitPerMTok: 0.14, outputPerMTok: 21.0 }
  },
  defaultModel: 'deepseek-v4-flash',
  feishuExportTarget: 'personal',
  trackedProjectIds: [],
  chunkSize: 100
}

// 飞书各字段的获取说明
const FEISHU_HELP = {
  appId: `1. 打开飞书开放平台 https://open.feishu.cn
2. 创建或选择一个「企业自建应用」
3. 左侧菜单 → 「凭证与基础信息」
4. 复制「App ID」`,
  appSecret: `1. 同上，在「凭证与基础信息」页面
2. 点击「App Secret」旁的「查看」或「重置」
3. 复制获取到的密钥`,
  docFolderToken: `1. 打开飞书文档 https://xxx.feishu.cn/drive/
2. 进入你想要导出日报的文件夹
3. 浏览器地址栏 URL 末尾的字符串即为 Token
   例如：https://xxx.feishu.cn/drive/folder/「这里的字符串」`,
  baseAppToken: `1. 打开飞书多维表格 https://xxx.feishu.cn/base/
2. 进入你的多维表格
3. 浏览器地址栏 URL 末尾的字符串即为 App Token
   例如：https://xxx.feishu.cn/base/「这里的字符串」`,
  baseTableId: `1. 进入多维表格后，选择一个数据表
2. 浏览器地址栏 URL 中 ?table= 后面的值
   例如：https://xxx.feishu.cn/base/xxx?table=「这里的字符串」`
}

// 带帮助按钮的标签
function LabelWithHelp({ text, helpKey }: { text: string; helpKey: keyof typeof FEISHU_HELP }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {text}
      <Popover
        title="如何获取？"
        content={<div style={{ whiteSpace: 'pre-line', fontSize: 13, lineHeight: 1.8, maxWidth: 400 }}>
          {FEISHU_HELP[helpKey]}
        </div>}
      >
        <IconQuestionCircle style={{ color: 'var(--color-text-4)', cursor: 'pointer', fontSize: 14 }} />
      </Popover>
    </span>
  )
}

export default function SettingsPage() {
  const [config, setConfig] = useState<AppConfig>(defaultConfig)
  const [loading, setLoading] = useState(false)
  // 新增模型定价
  const [newModelName, setNewModelName] = useState('')
  const [newModelInput, setNewModelInput] = useState<number>(0)
  const [newModelCacheHit, setNewModelCacheHit] = useState<number>(0)
  const [newModelOutput, setNewModelOutput] = useState<number>(0)
  // API 测试状态
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null)
  // 余额状态
  const [balance, setBalance] = useState<{
    total: string; currency: string; granted: string; toppedUp: string
  } | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [balanceError, setBalanceError] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI.invoke('get-config').then((c: AppConfig | null) => {
      if (c) {
        setConfig({
          ...defaultConfig,
          ...c,
          feishu: { ...defaultConfig.feishu, ...(c.feishu || {}) },
          modelPricing: c.modelPricing && Object.keys(c.modelPricing).length > 0
            ? c.modelPricing
            : defaultConfig.modelPricing
        })
      }
    }).catch(() => {})
  }, [])

  const handleSave = async () => {
    setLoading(true)
    try {
      await window.electronAPI.invoke('save-config', config)
      Message.success('配置已保存')
    } catch (e) {
      Message.error('保存失败: ' + String(e))
    } finally {
      setLoading(false)
    }
  }

  // 添加自定义模型定价
  const handleAddModel = () => {
    const name = newModelName.trim()
    if (!name) { Message.warning('请输入模型名称'); return }
    if (config.modelPricing[name]) { Message.warning('该模型已存在'); return }
    setConfig(c => ({
      ...c,
      modelPricing: {
        ...c.modelPricing,
        [name]: { inputPerMTok: newModelInput, cacheHitPerMTok: newModelCacheHit, outputPerMTok: newModelOutput }
      }
    }))
    setNewModelName('')
    setNewModelInput(0)
    setNewModelCacheHit(0)
    setNewModelOutput(0)
  }

  // 删除模型定价
  const handleRemoveModel = (model: string) => {
    setConfig(c => {
      const next = { ...c.modelPricing }
      delete next[model]
      return { ...c, modelPricing: next }
    })
  }

  // 更新模型定价
  const handleUpdatePricing = (model: string, field: keyof ModelPricing, value: number) => {
    setConfig(c => ({
      ...c,
      modelPricing: {
        ...c.modelPricing,
        [model]: { ...c.modelPricing[model], [field]: value ?? 0 }
      }
    }))
  }

  return (
    <div style={{ maxWidth: 720 }}>
      {/* AI 配置 */}
      <Card title="🤖 AI 模型配置" style={{ marginBottom: 20 }}>
        <Form layout="vertical">
          <FormItem label="API Key" required>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input.Password
                value={config.apiKey}
                onChange={v => setConfig(c => ({ ...c, apiKey: v }))}
                placeholder="sk-ant-api-xxxxxxxx 或 sk-xxxxxxxx"
                style={{ flex: 1 }}
              />
              <Button
                loading={testing}
                onClick={async () => {
                  if (!config.apiKey) { Message.warning('请先输入 API Key'); return }
                  setTesting(true)
                  setTestResult(null)
                  try {
                    const results = await window.electronAPI.invoke(
                      'test-api-key',
                      config.apiKey,
                      config.apiBaseUrl || undefined
                    )
                    const ok = results.find((r: any) => r.ok)
                    if (ok) {
                      setTestResult({ ok: true, detail: `✅ 连接成功！\n工作路径: ${ok.url}` })
                      Message.success('API 连接成功！')
                    } else {
                      const detail = results.map((r: any) =>
                        `• ${r.url}\n  状态码: ${r.status}  ${r.error ? '错误: ' + r.error : ''}`
                      ).join('\n\n')
                      setTestResult({ ok: false, detail: `❌ 连接失败\n\n${detail}` })
                      Message.error('API 连接失败，点击查看详情')
                    }
                  } catch (e) {
                    setTestResult({ ok: false, detail: `异常: ${String(e)}` })
                    Message.error('测试异常')
                  } finally {
                    setTesting(false)
                  }
                }}
              >
                {testing ? '测试中...' : '🔍 测试连接'}
              </Button>
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--color-text-3)' }}>
              支持 DeepSeek / Claude / OpenAI 兼容 API。Key 以 sk-ant- 开头用 Anthropic SDK，否则用 OpenAI 兼容格式
            </div>
            {testResult && (
              <div style={{
                marginTop: 8, padding: '8px 12px', borderRadius: 6, fontSize: 13,
                background: testResult.ok ? 'var(--color-success-light-1)' : 'var(--color-danger-light-1)',
                color: testResult.ok ? 'var(--color-success-6)' : 'var(--color-danger-6)',
                whiteSpace: 'pre-line', lineHeight: 1.6
              }}>
                {testResult.detail}
              </div>
            )}
            {/* 余额查询 */}
            <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              <Button
                size="small"
                loading={balanceLoading}
                onClick={async () => {
                  if (!config.apiKey) { Message.warning('请先输入 API Key'); return }
                  setBalanceLoading(true)
                  setBalanceError(null)
                  setBalance(null)
                  try {
                    const result = await window.electronAPI.invoke('get-deepseek-balance')
                    if (result.available && result.infos?.length > 0) {
                      const info = result.infos.find((i: any) => i.currency === 'CNY') || result.infos[0]
                      setBalance({
                        total: info.total_balance,
                        currency: info.currency || 'CNY',
                        granted: info.granted_balance || '0.00',
                        toppedUp: info.topped_up_balance || '0.00'
                      })
                      Message.success('余额查询成功')
                    } else {
                      setBalanceError(result.error || '无法获取余额，请确认 API Key 为 DeepSeek 密钥')
                    }
                  } catch (e) {
                    setBalanceError(`查询失败: ${String(e)}`)
                  } finally {
                    setBalanceLoading(false)
                  }
                }}
              >
                💰 查询余额
              </Button>
              {balance && (
                <Tag color="green" style={{ fontSize: 14, padding: '4px 12px' }}>
                  💰 ¥{balance.total}
                </Tag>
              )}
              {balance && balance.currency === 'CNY' && (
                <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>
                  （充值 ¥{balance.toppedUp} + 赠送 ¥{balance.granted}）
                </span>
              )}
              {balanceError && (
                <span style={{ fontSize: 12, color: 'var(--color-danger-6)' }}>{balanceError}</span>
              )}
            </div>
          </FormItem>
          <FormItem label="API 地址（可选，默认使用官方地址）">
            <Input
              value={config.apiBaseUrl ?? ''}
              onChange={v => setConfig(c => ({ ...c, apiBaseUrl: v }))}
              placeholder="留空使用默认地址，或填入代理/中转地址"
            />
          </FormItem>
          <FormItem label="默认 AI 模型">
            <Input
              value={config.defaultModel}
              onChange={v => setConfig(c => ({ ...c, defaultModel: v }))}
              placeholder="claude-sonnet-5"
            />
          </FormItem>
        </Form>
      </Card>

      {/* 模型定价 — 完全自定义 */}
      <Card title="💰 模型定价 (¥/百万Token)" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 16 }}>
          自定义每个模型每百万 Token 的价格。缓存命中输入使用单独的折扣价
        </div>

        {/* 表头 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 12, color: 'var(--color-text-3)', paddingRight: 40 }}>
          <span style={{ width: 140, minWidth: 140 }}>模型</span>
          <span style={{ width: 150 }}>输入(缓存未命中)</span>
          <span style={{ width: 150 }}>输入(缓存命中)</span>
          <span style={{ width: 150 }}>输出</span>
        </div>

        {/* 已有模型列表 */}
        {Object.keys(config.modelPricing).length === 0 ? (
          <div style={{ color: 'var(--color-text-3)', marginBottom: 16 }}>暂无模型定价，请在下方添加</div>
        ) : (
          Object.entries(config.modelPricing).map(([model, price]) => (
            <div key={model} style={{
              display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center',
              padding: '8px 8px', background: 'var(--color-fill-1)', borderRadius: 6
            }}>
              <Tag color="blue" style={{ minWidth: 140, textAlign: 'center', marginRight: 0 }}>{model}</Tag>
              <InputNumber value={price.inputPerMTok} min={0} step={0.01}
                onChange={v => handleUpdatePricing(model, 'inputPerMTok', v ?? 0)}
                suffix="¥" style={{ width: 150 }} />
              <InputNumber value={price.cacheHitPerMTok ?? 0} min={0} step={0.01}
                onChange={v => handleUpdatePricing(model, 'cacheHitPerMTok', v ?? 0)}
                suffix="¥" style={{ width: 150 }} />
              <InputNumber value={price.outputPerMTok} min={0} step={0.01}
                onChange={v => handleUpdatePricing(model, 'outputPerMTok', v ?? 0)}
                suffix="¥" style={{ width: 150 }} />
              <Button type="text" status="danger" size="small" icon={<IconDelete />}
                onClick={() => handleRemoveModel(model)} />
            </div>
          ))
        )}

        {/* 添加新模型 */}
        <Divider />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input
            value={newModelName}
            onChange={setNewModelName}
            placeholder="模型名称"
            style={{ width: 140 }}
            onPressEnter={handleAddModel}
          />
          <InputNumber value={newModelInput} min={0} step={0.01}
            onChange={v => setNewModelInput(v ?? 0)}
            placeholder="缓存未命中" suffix="¥" style={{ width: 140 }} />
          <InputNumber value={newModelCacheHit} min={0} step={0.01}
            onChange={v => setNewModelCacheHit(v ?? 0)}
            placeholder="缓存命中" suffix="¥" style={{ width: 140 }} />
          <InputNumber value={newModelOutput} min={0} step={0.01}
            onChange={v => setNewModelOutput(v ?? 0)}
            placeholder="输出" suffix="¥" style={{ width: 140 }} />
          <Button type="outline" onClick={handleAddModel}>➕ 添加</Button>
        </div>
      </Card>

      {/* 通用设置 */}
      <Card title="⏰ 通用设置" style={{ marginBottom: 20 }}>
        <Form layout="vertical">
          <FormItem label="工作日开始时间（凌晨 N 点之前算前一天）">
            <InputNumber
              value={config.workdayStartHour}
              min={0} max={23}
              onChange={v => setConfig(c => ({ ...c, workdayStartHour: v ?? 5 }))}
              suffix="点"
            />
          </FormItem>
          <FormItem label="关闭窗口时最小化到托盘">
            <Switch
              checked={config.closeToTray}
              onChange={v => setConfig(c => ({ ...c, closeToTray: v }))}
            />
          </FormItem>
        </Form>
      </Card>

      {/* 飞书配置 */}
      <Card title="📡 飞书配置" style={{ marginBottom: 20 }}>
        <Form layout="vertical">
          <FormItem label={<LabelWithHelp text="App ID" helpKey="appId" />}>
            <Input value={config.feishu.appId}
              onChange={v => setConfig(c => ({ ...c, feishu: { ...c.feishu, appId: v } }))}
              placeholder="cli_xxxxxxxx" />
          </FormItem>
          <FormItem label={<LabelWithHelp text="App Secret" helpKey="appSecret" />}>
            <Input.Password value={config.feishu.appSecret}
              onChange={v => setConfig(c => ({ ...c, feishu: { ...c.feishu, appSecret: v } }))}
              placeholder="••••••••" />
          </FormItem>
          <FormItem label={<LabelWithHelp text="文档导出文件夹 Token（可选）" helpKey="docFolderToken" />}>
            <Input value={config.feishu.docFolderToken ?? ''}
              onChange={v => setConfig(c => ({ ...c, feishu: { ...c.feishu, docFolderToken: v } }))} />
          </FormItem>
          <FormItem label={<LabelWithHelp text="多维表格 App Token（可选）" helpKey="baseAppToken" />}>
            <Input value={config.feishu.baseAppToken ?? ''}
              onChange={v => setConfig(c => ({ ...c, feishu: { ...c.feishu, baseAppToken: v } }))} />
          </FormItem>
          <FormItem label={<LabelWithHelp text="多维表格 Table ID（可选）" helpKey="baseTableId" />}>
            <Input value={config.feishu.baseTableId ?? ''}
              onChange={v => setConfig(c => ({ ...c, feishu: { ...c.feishu, baseTableId: v } }))} />
          </FormItem>
        </Form>
      </Card>

      <Button type="primary" loading={loading} onClick={handleSave} size="large">
        💾 保存配置
      </Button>
    </div>
  )
}
