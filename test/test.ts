import { timeoutPromise } from "../src/utils/lib";
import { RedLock } from "../src/index";

class Test1 {

  @RedLock()
  async aa(name: string) {
    this.bb();
    await timeoutPromise(50000);
  }

  bb() {
    console.log("bb exec");
  }
}

const ins = new Test1();

ins.aa("111111");