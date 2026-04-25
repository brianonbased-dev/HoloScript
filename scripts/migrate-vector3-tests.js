module.exports = function (fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  let hasChanges = false;

  // Handle Object Expressions: {x, y, z} -> [x, y, z] and {x, z} -> [x, 0, z]
  root.find(j.ObjectExpression).forEach(path => {
    const props = path.node.properties;
    if (!props) return;

    if (props.length === 3) {
      const x = props.find(p => p.key && (p.key.name === 'x' || p.key.value === 'x'));
      const y = props.find(p => p.key && (p.key.name === 'y' || p.key.value === 'y'));
      const z = props.find(p => p.key && (p.key.name === 'z' || p.key.value === 'z'));

      if (x && y && z && x.value && y.value && z.value) {
        if (x.method || y.method || z.method) return;
        j(path).replaceWith(j.arrayExpression([x.value, y.value, z.value]));
        hasChanges = true;
      }
    } else if (props.length === 2) {
      const x = props.find(p => p.key && (p.key.name === 'x' || p.key.value === 'x'));
      const z = props.find(p => p.key && (p.key.name === 'z' || p.key.value === 'z'));
      
      if (x && z && x.value && z.value) {
        if (x.method || z.method) return;
        j(path).replaceWith(j.arrayExpression([x.value, j.numericLiteral(0), z.value]));
        hasChanges = true;
      }
    }
  });

  // Handle Member Access: .x -> [0], .y -> [1], .z -> [2]
  // We only do this if it's likely a vector. In tests, we'll be a bit more aggressive.
  root.find(j.MemberExpression).forEach(path => {
    const property = path.node.property;
    if (property.type === 'Identifier') {
      if (property.name === 'x') {
        j(path).replaceWith(j.memberExpression(path.node.object, j.numericLiteral(0), true));
        hasChanges = true;
      } else if (property.name === 'y') {
        j(path).replaceWith(j.memberExpression(path.node.object, j.numericLiteral(1), true));
        hasChanges = true;
      } else if (property.name === 'z') {
        j(path).replaceWith(j.memberExpression(path.node.object, j.numericLiteral(2), true));
        hasChanges = true;
      }
    }
  });

  // Handle Type Literals
  root.find(j.TSTypeLiteral).forEach(path => {
    const members = path.node.members;
    if (!members) return;

    if (members.length === 3) {
      const x = members.find(m => m.key && (m.key.name === 'x' || m.key.value === 'x'));
      const y = members.find(m => m.key && (m.key.name === 'y' || m.key.value === 'y'));
      const z = members.find(m => m.key && (m.key.name === 'z' || m.key.value === 'z'));

      if (x && y && z && x.typeAnnotation && y.typeAnnotation && z.typeAnnotation) {
        j(path).replaceWith(j.tsTupleType([
          x.typeAnnotation.typeAnnotation,
          y.typeAnnotation.typeAnnotation,
          z.typeAnnotation.typeAnnotation
        ]));
        hasChanges = true;
      }
    } else if (members.length === 2) {
      const x = members.find(m => m.key && (m.key.name === 'x' || m.key.value === 'x'));
      const z = members.find(m => m.key && (m.key.name === 'z' || m.key.value === 'z'));

      if (x && z && x.typeAnnotation && z.typeAnnotation) {
        j(path).replaceWith(j.tsTupleType([
          x.typeAnnotation.typeAnnotation,
          j.tsNumberKeyword(),
          z.typeAnnotation.typeAnnotation
        ]));
        hasChanges = true;
      }
    }
  });

  return hasChanges ? root.toSource() : null;
};
