# 工作流程

## 项目概览

机械臂VLA（Vision-Language-Action）项目，目标实现基于视觉-语言指令的机械臂自主操作。

## 环境配置

### 硬件环境
- 机械臂：UR5 / UR10
- 相机：Intel RealSense D435
- GPU：RTX 4090 × 2
- 工控机：i9-13900K + 64GB RAM

### 软件环境
```bash
# 激活 conda 环境
conda activate vla-dev

# 关键依赖
python==3.10
torch==2.4.0
transformers==4.40.0
opencv-python==4.9.0
```

## 开发规范

### 代码风格
- Python 3.10+ 类型注解
- 使用 `black` 格式化，行宽 100
- 使用 `ruff` 做 linting

### 测试要求
- 核心算法必须有单元测试
- 仿真测试通过后才能上实机
- 标定精度测试阈值：±0.5mm

### 数据管理
- 原始数据路径：`/data/vla/raw/`
- 预处理数据：`/data/vla/processed/`
- 模型权重：`/data/vla/weights/`
- 实验记录：`/data/vla/experiments/`

## 关键联系人

| 角色 | 姓名 | 职责 |
|------|------|------|
| 算法负责人 | 张工 | VLA模型开发 |
| 硬件负责人 | 李工 | 机械臂调试维护 |
| 数据标注 | 王工 | 数据集准备 |

## 会议安排

- 周一 09:30 周会（全体）
- 周二/周四 14:00 算法讨论
- 周五 16:00 周报总结
