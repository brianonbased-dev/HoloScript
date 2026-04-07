// Omnipotent Proxy Stub
// Safely stubs ANY deep import from @holoscript/engine aliases, ensuring that
// functions, constructors, and decorators do not crash during client-side evaluation.

const proxyHandler = {
  get(target, prop) {
    if (prop === '__esModule') return true;
    if (prop === 'then') return undefined; // avoid promise chain
    return buildOmni();
  },
  apply(target, thisArg, argumentsList) {
    // If called as a decorator (target, propertyKey, descriptor)
    if (argumentsList.length === 3 && typeof argumentsList[2] === 'object' && argumentsList[2] !== null) {
      if ('value' in argumentsList[2] || 'get' in argumentsList[2] || 'writable' in argumentsList[2]) {
        return argumentsList[2]; // Return the original descriptor unmodified
      }
    }
    return buildOmni();
  },
  construct() {
    return buildOmni();
  }
};

function buildOmni() {
  const f = function() {};
  return new Proxy(f, proxyHandler);
}

module.exports = buildOmni();
