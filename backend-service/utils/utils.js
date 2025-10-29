function cleanEnv(value) {
    if (!value) return value;
    return value.replace(/^"(.*)"$/, "$1");
  }

  export default cleanEnv;