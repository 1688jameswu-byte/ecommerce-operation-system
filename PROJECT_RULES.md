# 项目开发规则

## 一、项目定位

本项目不是 TEMU 专用系统，而是电商运营系统。

当前阶段优先支持 TEMU，但所有新增的数据结构、字段、模型、接口，必须按未来支持 TEMU / Amazon / TikTok / Shopify /1688 的多平台架构设计。

## 二、架构规则

1. 禁止写死 TEMU 字段。
2. 禁止平台耦合。
3. 采用平台无关的数据模型。
4. 平台只是数据来源，不是系统主体。
5. 系统主体应围绕：平台、店铺、订单、流量、广告、售后、利润、运营、绩效。

## 三、开发规则

1. 最小化修改。
2. 不重构无关功能。
3. 不修改无关页面。
4. 不改变现有可用功能。
5. 每次修改前先说明影响范围。
6. 每次修改后说明改了哪些文件。
7. 涉及数据结构时，必须说明是否影响历史数据。

## 四、命名规则

字段命名必须优先使用平台无关名称。

推荐：

platform
storeId
storeName
orderId
salesAmount
orderCount
traffic
visitorCount
conversionRate
adCost
refundAmount
refundRate
operatorId

不推荐：

temuStoreName
temuOrderAmount
temuTraffic
temuAdCost
