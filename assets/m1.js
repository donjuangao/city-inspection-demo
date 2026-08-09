/* ===== 模块 m1 视图 · 归属 W1-A 工兵(施工图 §7/§8 裁定②:模块拆独立文件,文件互斥) =====
   契约:VIEWS.m1 = function(ctx) 返回 HTML 字符串;ctx={module,rest[],hash}
   共享文件(tokens/store/data/ui/app.html)只读;按钮用 data-action 属性走 UI.bindActions→S.commit */
VIEWS.m1 = function (ctx) { return VIEWS._ph('m1', ctx); };
