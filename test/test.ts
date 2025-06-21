import { timeoutPromise } from "../src/utils/lib";
import { RedLock } from "../src/index";

class Test1 {

  @RedLock()
  async aa(name: string) {
    this.bb();
    await timeoutPromise(50000);
  }

  bb() {
    // Debug模式下输出测试信息
if (process.env.NODE_ENV === 'test' && process.env.DEBUG) {
  console.log("bb exec");
}
  }
}

const ins = new Test1();

ins.aa("111111");