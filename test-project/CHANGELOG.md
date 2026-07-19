# 变更日志

## [0.3.0] - 2026-07-19

### 新增
- 6轴末端执行器自动标定模块 `src/calibration/end_effector.py`（156行）
- 标定精度单元测试 `tests/test_calibration.py`（89行）
- 数据集流式加载管道 `src/pipeline/stream_dataset.py`

### 修改
- 数据管道重构，修复大数据集OOM问题（+32/-8行）
- 配置文件增加标定参数段 `config/calibration.yaml`

### 修复
- 修复 Gazebo 仿真中力矩传感器初始化为零的问题
- 修复多GPU训练时梯度同步的竞态条件

---

## [0.2.0] - 2026-07-12

### 新增
- VLA基础模型训练脚本 `train_vla.py`
- 模型评估指标计算 `metrics/eval.py`

### 修改
- 更新依赖：PyTorch → 2.4.0, cuDNN → 9.0
- 重构动作空间编码，支持连续+离散混合动作

---

## [0.1.0] - 2026-07-01

### 新增
- 项目初始化
- 数据采集脚本
- 基础预处理工具
