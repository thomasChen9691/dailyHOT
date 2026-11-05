import { defineWebModule } from "@aihot/web/modules";
import { IconChart, IconSparkles } from "@aihot/web/components/icons";
import { BOARDS } from "./boards.ts";

// 桌面侧栏与「我的」页放板块入口。手机底栏已有 4 个 tab，再加 2 个会把第五、六个挤出屏幕，
// 所以这里不提供 tabs；页面自身也不声明 tab，保留读者来的那个 tab。
export default defineWebModule({
  name: "board",
  sidebar: {
    section: "内容",
    items: [
      { to: "/ai", label: BOARDS.ai.title, icon: IconSparkles },
      { to: "/finance", label: BOARDS.finance.title, icon: IconChart },
    ],
  },
  tools: [
    { to: "/ai", label: BOARDS.ai.title, icon: <IconSparkles size={18} /> },
    { to: "/finance", label: BOARDS.finance.title, icon: <IconChart size={18} /> },
  ],
});
