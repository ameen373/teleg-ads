window.ApiModule = (function () {
  function request() {
    return Promise.resolve(null);
  }

  return {
    request: request
  };
})();
