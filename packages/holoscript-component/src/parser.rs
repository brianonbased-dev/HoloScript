//! Parser for HoloScript that produces WIT-compatible AST nodes.

use crate::lexer::{tokenize, SpannedToken, Token, get_line_col};
use crate::holoscript::core::types::{
    CompositionNode, ObjectNode, TemplateNode, SpatialGroupNode, AnimationNode,
    TimelineNode, LightNode, CameraNode, Property, PropertyValue, EnvironmentNode,
    Span, Position, Diagnostic, Severity as DiagnosticSeverity,
};

/// Parse HoloScript source into a CompositionNode
pub fn parse_holoscript(source: &str) -> Result<CompositionNode, Vec<Diagnostic>> {
    let tokens = match tokenize(source) {
        Ok(t) => t,
        Err(errors) => {
            return Err(errors.into_iter().map(|(span, msg)| {
                let (line, col) = get_line_col(source, span.start);
                Diagnostic {
                    severity: DiagnosticSeverity::Error,
                    message: msg,
                    span: Some(Span {
                        start: Position { line: line as u32, column: col as u32, offset: span.start as u32 },
                        end: Position { line: line as u32, column: (col + span.end - span.start) as u32, offset: span.end as u32 },
                    }),
                    code: Some("E001".to_string()),
                }
            }).collect());
        }
    };
    
    let mut parser = Parser::new(source, tokens);
    parser.parse_composition()
}

/// Parse just the header (composition name)
pub fn parse_header(source: &str) -> Result<String, String> {
    let tokens = tokenize(source).map_err(|e| e[0].1.clone())?;
    let mut parser = Parser::new(source, tokens);
    parser.parse_composition_header()
}

/// Validate source and return diagnostics
pub fn validate_holoscript(source: &str) -> (bool, Vec<Diagnostic>) {
    match parse_holoscript(source) {
        Ok(_) => (true, vec![]),
        Err(errors) => (false, errors),
    }
}

struct Parser<'a> {
    source: &'a str,
    tokens: Vec<SpannedToken>,
    pos: usize,
}

impl<'a> Parser<'a> {
    fn new(source: &'a str, tokens: Vec<SpannedToken>) -> Self {
        Self { source, tokens, pos: 0 }
    }
    
    fn current(&self) -> Option<&SpannedToken> {
        self.tokens.get(self.pos)
    }
    
    fn advance(&mut self) -> Option<&SpannedToken> {
        let tok = self.tokens.get(self.pos);
        self.pos += 1;
        tok
    }
    
    fn expect_token(&mut self, expected: &Token) -> Result<&SpannedToken, Diagnostic> {
        match self.current() {
            Some(tok) if std::mem::discriminant(&tok.token) == std::mem::discriminant(expected) => {
                Ok(self.advance().unwrap())
            }
            Some(tok) => {
                let (line, col) = get_line_col(self.source, tok.span.start);
                Err(Diagnostic {
                    severity: DiagnosticSeverity::Error,
                    message: format!("Expected {:?}, found {:?}", expected, tok.token),
                    span: Some(Span {
                        start: Position { line: line as u32, column: col as u32, offset: tok.span.start as u32 },
                        end: Position { line: line as u32, column: (col + tok.span.end - tok.span.start) as u32, offset: tok.span.end as u32 },
                    }),
                    code: Some("E002".to_string()),
                })
            }
            None => {
                Err(Diagnostic {
                    severity: DiagnosticSeverity::Error,
                    message: format!("Unexpected end of file, expected {:?}", expected),
                    span: Some(Span {
                        start: Position { line: 1, column: 1, offset: 0 },
                        end: Position { line: 1, column: 1, offset: 0 },
                    }),
                    code: Some("E003".to_string()),
                })
            }
        }
    }
    
    fn parse_composition_header(&mut self) -> Result<String, String> {
        // Expect: composition "Name"
        match self.current() {
            Some(SpannedToken { token: Token::Composition, .. }) => {
                self.advance();
            }
            _ => return Err("Expected 'composition' keyword".to_string()),
        }
        
        match self.current() {
            Some(SpannedToken { token: Token::String(name), .. }) |
            Some(SpannedToken { token: Token::SingleQuoteString(name), .. }) => {
                Ok(name.clone())
            }
            _ => Err("Expected composition name string".to_string()),
        }
    }
    
    fn parse_composition(&mut self) -> Result<CompositionNode, Vec<Diagnostic>> {
        let mut errors = Vec::new();
        
        // composition "Name" { ... }
        if !matches!(self.current(), Some(SpannedToken { token: Token::Composition, .. })) {
            return Err(vec![self.error("Expected 'composition' keyword")]);
        }
        
        let start_span = self.current().map(|t| &t.span).cloned();
        self.advance();
        
        let name = match self.current() {
            Some(SpannedToken { token: Token::String(n), .. }) |
            Some(SpannedToken { token: Token::SingleQuoteString(n), .. }) => {
                let n = n.clone();
                self.advance();
                n
            }
            _ => {
                errors.push(self.error("Expected composition name"));
                "Unnamed".to_string()
            }
        };
        
        // Expect opening brace
        if let Err(e) = self.expect_token(&Token::LBrace) {
            errors.push(e);
        }
        
        // Parse composition body
        let mut templates = Vec::new();
        let mut objects = Vec::new();
        let mut groups = Vec::new();
        let mut animations = Vec::new();
        let mut timelines = Vec::new();
        let mut lights = Vec::new();
        let mut cameras = Vec::new();
        let mut environment = None;
        
        while let Some(tok) = self.current() {
            if matches!(tok.token, Token::RBrace) {
                break;
            }
            
            match &tok.token {
                Token::Template => {
                    match self.parse_template() {
                        Ok(t) => templates.push(t),
                        Err(e) => errors.push(e),
                    }
                }
                Token::Object => {
                    match self.parse_object() {
                        Ok(o) => objects.push(o),
                        Err(e) => errors.push(e),
                    }
                }
                Token::Environment => {
                    match self.parse_environment() {
                        Ok(e) => environment = Some(e),
                        Err(e) => errors.push(e),
                    }
                }
                Token::SpatialGroup => {
                    match self.parse_group() {
                        Ok(g) => groups.push(g),
                        Err(e) => errors.push(e),
                    }
                }
                Token::Animation => {
                    match self.parse_animation() {
                        Ok(a) => animations.push(a),
                        Err(e) => errors.push(e),
                    }
                }
                Token::Timeline => {
                    match self.parse_timeline() {
                        Ok(t) => timelines.push(t),
                        Err(e) => errors.push(e),
                    }
                }
                Token::DirectionalLight | Token::PointLight | Token::SpotLight | Token::AmbientLight => {
                    match self.parse_light() {
                        Ok(l) => lights.push(l),
                        Err(e) => errors.push(e),
                    }
                }
                Token::PerspectiveCamera | Token::OrthographicCamera => {
                    match self.parse_camera() {
                        Ok(c) => cameras.push(c),
                        Err(e) => errors.push(e),
                    }
                }
                Token::Logic => {
                    // Skip logic blocks for now
                    self.skip_block();
                }
                _ => {
                    // Unknown token, try to skip
                    self.advance();
                }
            }
        }
        
        // Expect closing brace
        if let Err(e) = self.expect_token(&Token::RBrace) {
            errors.push(e);
        }
        
        if !errors.is_empty() {
            return Err(errors);
        }
        
        Ok(CompositionNode {
            name,
            templates,
            objects,
            spatial_groups: groups,
            animations,
            timelines,
            lights,
            cameras,
            environment,
            event_handlers: vec![],
            span: start_span.map(|s| Span {
                start: Position { line: 1, column: 1, offset: s.start as u32 },
                end: Position { line: 1, column: 1, offset: s.end as u32 },
            }),
        })
    }
    
    fn parse_template(&mut self) -> Result<TemplateNode, Diagnostic> {
        // template "Name" { ... }
        self.advance(); // consume 'template'
        
        let name = match self.current() {
            Some(SpannedToken { token: Token::String(n), .. }) |
            Some(SpannedToken { token: Token::SingleQuoteString(n), .. }) => {
                let n = n.clone();
                self.advance();
                n
            }
            _ => return Err(self.error("Expected template name")),
        };
        
        // Collect traits
        let mut traits = Vec::new();
        while let Some(SpannedToken { token: Token::Trait(t), .. }) = self.current() {
            traits.push(t.clone());
            self.advance();
        }
        
        self.expect_token(&Token::LBrace)?;
        
        // Parse properties
        let properties = self.parse_properties()?;
        
        self.expect_token(&Token::RBrace)?;
        
        Ok(TemplateNode {
            name,
            traits,
            properties,
            state: vec![],
            actions: vec![],
            span: None,
        })
    }
    
    fn parse_object(&mut self) -> Result<ObjectNode, Diagnostic> {
        // object "Name" @traits { properties... children... keyframes... }
        self.advance(); // consume 'object'
        
        let name = match self.current() {
            Some(SpannedToken { token: Token::String(n), .. }) |
            Some(SpannedToken { token: Token::SingleQuoteString(n), .. }) => {
                let n = n.clone();
                self.advance();
                n
            }
            _ => return Err(self.error("Expected object name")),
        };
        
        // Collect traits
        let mut traits = Vec::new();
        while let Some(SpannedToken { token: Token::Trait(t), .. }) = self.current() {
            traits.push(t.clone());
            self.advance();
        }
        
        // Check for "using" template
        let mut template = None;
        if let Some(SpannedToken { token: Token::Using, .. }) = self.current() {
            self.advance();
            if let Some(SpannedToken { token: Token::String(t), .. }) | 
               Some(SpannedToken { token: Token::SingleQuoteString(t), .. }) = self.current() {
                template = Some(t.clone());
                self.advance();
            }
        }
        
        self.expect_token(&Token::LBrace)?;
        
        // Parse properties (stops at non-Identifier tokens like 'object' or '}')
        let properties = self.parse_properties()?;
        
        // Parse nested child objects (native asset composition)
        let mut children = Vec::new();
        while matches!(self.current(), Some(SpannedToken { token: Token::Object, .. })) {
            children.push(self.parse_object()?);
        }
        
        // Parse keyframes blocks (animation data)
        let mut keyframes_list: Vec<serde_json::Value> = Vec::new();
        while matches!(self.current(), Some(SpannedToken { token: Token::Keyframes, .. })) {
            keyframes_list.push(self.parse_keyframes()?);
        }
        
        self.expect_token(&Token::RBrace)?;
        
        // Serialize children + keyframes as JSON (WIT recursive type workaround)
        let children_json = if children.is_empty() && keyframes_list.is_empty() {
            String::new()
        } else {
            let children_data = Self::serialize_children_json(&children);
            if keyframes_list.is_empty() {
                children_data
            } else {
                // Combine children and keyframes into a JSON object
                let combined = serde_json::json!({
                    "__children": serde_json::from_str::<serde_json::Value>(&children_data).unwrap_or(serde_json::json!([])),
                    "__keyframes": keyframes_list,
                });
                serde_json::to_string(&combined).unwrap_or_else(|_| "{}".to_string())
            }
        };
        
        Ok(ObjectNode {
            name,
            traits,
            template,
            properties,
            children_json,
            span: None,
        })
    }
    
    /// Parse a keyframes block: `keyframes "name" { 0%: {...} 50%: {...} duration: 2000 }`
    fn parse_keyframes(&mut self) -> Result<serde_json::Value, Diagnostic> {
        self.advance(); // consume 'keyframes'
        
        // Parse name
        let name = match self.current() {
            Some(SpannedToken { token: Token::String(n), .. }) |
            Some(SpannedToken { token: Token::SingleQuoteString(n), .. }) |
            Some(SpannedToken { token: Token::Identifier(n), .. }) => {
                let n = n.clone();
                self.advance();
                n
            }
            _ => return Err(self.error("Expected keyframes name")),
        };
        
        self.expect_token(&Token::LBrace)?;
        
        let mut stops: Vec<serde_json::Value> = Vec::new();
        let mut duration: u32 = 1000;
        let mut easing = "linear".to_string();
        let mut loop_anim = false;
        
        while let Some(tok) = self.current() {
            if matches!(tok.token, Token::RBrace) {
                break;
            }
            
            match &tok.token {
                // Percentage stop: `0%: { ... }` or `50%: { ... }`
                Token::Number(n) => {
                    let pct = *n;
                    self.advance();
                    
                    // Expect % then :
                    if matches!(self.current(), Some(SpannedToken { token: Token::Percent, .. })) {
                        self.advance(); // consume %
                    }
                    self.expect_token(&Token::Colon)?;
                    
                    // Parse the property block { rotation: [...], position: [...] }
                    self.expect_token(&Token::LBrace)?;
                    let stop_props = self.parse_properties()?;
                    self.expect_token(&Token::RBrace)?;
                    
                    // Convert properties to JSON
                    let mut prop_map = serde_json::Map::new();
                    prop_map.insert("percent".to_string(), serde_json::json!(pct));
                    for p in &stop_props {
                        let val = match &p.value {
                            PropertyValue::StringVal(s) => serde_json::json!(s),
                            PropertyValue::NumberVal(n) => serde_json::json!(n),
                            PropertyValue::BooleanVal(b) => serde_json::json!(b),
                            PropertyValue::NullVal => serde_json::Value::Null,
                            PropertyValue::ArrayVal(a) => {
                                serde_json::from_str(a).unwrap_or(serde_json::json!(a))
                            }
                            PropertyValue::ObjectVal(o) => {
                                serde_json::from_str(o).unwrap_or(serde_json::json!(o))
                            }
                        };
                        prop_map.insert(p.name.clone(), val);
                    }
                    
                    stops.push(serde_json::Value::Object(prop_map));
                }
                // Metadata properties: duration, easing, loop
                Token::Identifier(id) => {
                    let id = id.clone();
                    self.advance();
                    self.expect_token(&Token::Colon)?;
                    
                    match id.as_str() {
                        "duration" => {
                            if let Ok(PropertyValue::NumberVal(n)) = self.parse_value() {
                                duration = n as u32;
                            }
                        }
                        "easing" => {
                            if let Ok(PropertyValue::StringVal(s)) = self.parse_value() {
                                easing = s;
                            }
                        }
                        "loop" => {
                            if let Ok(PropertyValue::BooleanVal(b)) = self.parse_value() {
                                loop_anim = b;
                            }
                        }
                        _ => {
                            // Skip unknown properties
                            let _ = self.parse_value();
                        }
                    }
                }
                _ => break,
            }
        }
        
        self.expect_token(&Token::RBrace)?;
        
        Ok(serde_json::json!({
            "name": name,
            "stops": stops,
            "duration": duration,
            "easing": easing,
            "loop": loop_anim,
        }))
    }
    
    /// Serialize child ObjectNodes to JSON string for the children_json WIT field.
    /// Each child is encoded as a JSON object matching the ObjectNode WIT structure.
    fn serialize_children_json(children: &[ObjectNode]) -> String {
        let json_children: Vec<serde_json::Value> = children.iter().map(|c| {
            let props: Vec<serde_json::Value> = c.properties.iter().map(|p| {
                let val = match &p.value {
                    PropertyValue::StringVal(s) => serde_json::json!({"tag": "string-val", "val": s}),
                    PropertyValue::NumberVal(n) => serde_json::json!({"tag": "number-val", "val": n}),
                    PropertyValue::BooleanVal(b) => serde_json::json!({"tag": "boolean-val", "val": b}),
                    PropertyValue::NullVal => serde_json::json!({"tag": "null-val"}),
                    PropertyValue::ArrayVal(a) => serde_json::json!({"tag": "array-val", "val": a}),
                    PropertyValue::ObjectVal(o) => serde_json::json!({"tag": "object-val", "val": o}),
                };
                serde_json::json!({"name": p.name, "value": val})
            }).collect();
            serde_json::json!({
                "name": c.name,
                "template": c.template,
                "traits": c.traits,
                "properties": props,
                "childrenJson": c.children_json,
            })
        }).collect();
        serde_json::to_string(&json_children).unwrap_or_else(|_| "[]".to_string())
    }
    
    fn parse_properties(&mut self) -> Result<Vec<Property>, Diagnostic> {
        let mut properties = Vec::new();

        while let Some(tok) = self.current() {
            if matches!(tok.token, Token::RBrace) {
                break;
            }

            // Property name
            let prop_name = match &tok.token {
                Token::Identifier(id) => {
                    let id = id.clone();
                    self.advance();
                    id
                }
                _ => break,
            };

            // Colon
            if let Err(_) = self.expect_token(&Token::Colon) {
                continue;
            }

            // Value
            let value = self.parse_value()?;
            properties.push(Property {
                name: prop_name,
                value,
                span: None,
            });
        }

        Ok(properties)
    }
    
    fn parse_value(&mut self) -> Result<PropertyValue, Diagnostic> {
        match self.current() {
            Some(SpannedToken { token: Token::String(s), .. }) |
            Some(SpannedToken { token: Token::SingleQuoteString(s), .. }) => {
                let s = s.clone();
                self.advance();
                Ok(PropertyValue::StringVal(s))
            }
            Some(SpannedToken { token: Token::Number(n), .. }) => {
                let n = *n;
                self.advance();
                Ok(PropertyValue::NumberVal(n))
            }
            Some(SpannedToken { token: Token::True, .. }) => {
                self.advance();
                Ok(PropertyValue::BooleanVal(true))
            }
            Some(SpannedToken { token: Token::False, .. }) => {
                self.advance();
                Ok(PropertyValue::BooleanVal(false))
            }
            Some(SpannedToken { token: Token::Null, .. }) => {
                self.advance();
                Ok(PropertyValue::NullVal)
            }
            Some(SpannedToken { token: Token::LBracket, .. }) => {
                self.parse_array()
            }
            Some(SpannedToken { token: Token::LBrace, .. }) => {
                self.parse_object_value()
            }
            Some(SpannedToken { token: Token::Identifier(id), .. }) => {
                // Treat identifiers as string values for now
                let id = id.clone();
                self.advance();
                Ok(PropertyValue::StringVal(id))
            }
            _ => Err(self.error("Expected value")),
        }
    }
    
    fn parse_array(&mut self) -> Result<PropertyValue, Diagnostic> {
        self.advance(); // consume '['
        let mut values = Vec::new();

        while let Some(tok) = self.current() {
            if matches!(tok.token, Token::RBracket) {
                break;
            }

            values.push(self.parse_json_value()?);

            // Optional comma
            if matches!(self.current(), Some(SpannedToken { token: Token::Comma, .. })) {
                self.advance();
            }
        }

        self.expect_token(&Token::RBracket)?;
        // Convert to JSON string
        let json = serde_json::to_string(&values).unwrap_or_else(|_| "[]".to_string());
        Ok(PropertyValue::ArrayVal(json))
    }

    fn parse_json_value(&mut self) -> Result<serde_json::Value, Diagnostic> {
        match self.current() {
            Some(SpannedToken { token: Token::String(s), .. }) |
            Some(SpannedToken { token: Token::SingleQuoteString(s), .. }) => {
                let s = s.clone();
                self.advance();
                Ok(serde_json::Value::String(s))
            }
            Some(SpannedToken { token: Token::Number(n), .. }) => {
                let n = *n;
                self.advance();
                Ok(serde_json::Value::from(n))
            }
            Some(SpannedToken { token: Token::True, .. }) => {
                self.advance();
                Ok(serde_json::Value::Bool(true))
            }
            Some(SpannedToken { token: Token::False, .. }) => {
                self.advance();
                Ok(serde_json::Value::Bool(false))
            }
            Some(SpannedToken { token: Token::Null, .. }) => {
                self.advance();
                Ok(serde_json::Value::Null)
            }
            _ => Err(self.error("Expected JSON value")),
        }
    }

    fn parse_object_value(&mut self) -> Result<PropertyValue, Diagnostic> {
        self.advance(); // consume '{'
        let properties = self.parse_properties()?;
        self.expect_token(&Token::RBrace)?;
        // Convert properties to JSON object string
        let obj: serde_json::Map<String, serde_json::Value> = properties.iter()
            .filter_map(|p| {
                let val = match &p.value {
                    PropertyValue::StringVal(s) => serde_json::Value::String(s.clone()),
                    PropertyValue::NumberVal(n) => serde_json::Value::from(*n),
                    PropertyValue::BooleanVal(b) => serde_json::Value::Bool(*b),
                    PropertyValue::NullVal => serde_json::Value::Null,
                    PropertyValue::ArrayVal(json) | PropertyValue::ObjectVal(json) => {
                        serde_json::from_str(json.as_str()).ok()?
                    }
                };
                Some((p.name.clone(), val))
            })
            .collect();
        let json = serde_json::to_string(&obj).unwrap_or_else(|_| "{}".to_string());
        Ok(PropertyValue::ObjectVal(json))
    }
    
    fn parse_environment(&mut self) -> Result<EnvironmentNode, Diagnostic> {
        self.advance(); // consume 'environment'
        self.expect_token(&Token::LBrace)?;

        let properties = self.parse_properties()?;

        self.expect_token(&Token::RBrace)?;

        Ok(EnvironmentNode {
            properties,
            span: None,
        })
    }
    
    fn parse_group(&mut self) -> Result<SpatialGroupNode, Diagnostic> {
        self.advance(); // consume 'spatial_group'
        
        let name = match self.current() {
            Some(SpannedToken { token: Token::String(n), .. }) |
            Some(SpannedToken { token: Token::SingleQuoteString(n), .. }) => {
                let n = n.clone();
                self.advance();
                n
            }
            _ => return Err(self.error("Expected group name")),
        };
        
        self.expect_token(&Token::LBrace)?;
        
        let mut children = Vec::new();
        while let Some(tok) = self.current() {
            if matches!(tok.token, Token::RBrace) {
                break;
            }
            if matches!(tok.token, Token::Object) {
                children.push(self.parse_object()?);
            } else {
                self.advance();
            }
        }
        
        self.expect_token(&Token::RBrace)?;
        
        Ok(SpatialGroupNode {
            name,
            objects: children,
            span: None,
        })
    }
    
    fn parse_animation(&mut self) -> Result<AnimationNode, Diagnostic> {
        self.advance(); // consume 'animation'
        
        let name = match self.current() {
            Some(SpannedToken { token: Token::String(n), .. }) |
            Some(SpannedToken { token: Token::SingleQuoteString(n), .. }) |
            Some(SpannedToken { token: Token::Identifier(n), .. }) => {
                let n = n.clone();
                self.advance();
                n
            }
            _ => return Err(self.error("Expected animation name")),
        };
        
        self.expect_token(&Token::LBrace)?;
        
        let mut property = None;
        let mut duration = 1000;
        let mut easing = None;
        let mut from_val = None;
        let mut to_val = 0.0;
        let mut loop_mode = None;
        
        while let Some(tok) = self.current() {
            if matches!(tok.token, Token::RBrace) {
                break;
            }
            
            let prop_name = match &tok.token {
                Token::Identifier(id) => {
                    let id = id.clone();
                    self.advance();
                    id
                }
                _ => break,
            };
            
            self.expect_token(&Token::Colon)?;
            
            match prop_name.as_str() {
                "property" => {
                    if let Ok(PropertyValue::StringVal(s)) = self.parse_value() {
                        property = Some(s);
                    }
                }
                "duration" => {
                    if let Ok(PropertyValue::NumberVal(n)) = self.parse_value() {
                        duration = n as u32;
                    }
                }
                "easing" => {
                    if let Ok(PropertyValue::StringVal(s)) = self.parse_value() {
                        easing = Some(s);
                    }
                }
                "from" => {
                    if let Ok(PropertyValue::NumberVal(n)) = self.parse_value() {
                        from_val = Some(n);
                    }
                }
                "to" => {
                    if let Ok(PropertyValue::NumberVal(n)) = self.parse_value() {
                        to_val = n;
                    }
                }
                "loop" => {
                    if let Ok(PropertyValue::BooleanVal(b)) = self.parse_value() {
                        loop_mode = Some(if b { "infinite".to_string() } else { "once".to_string() });
                    } else if let Ok(PropertyValue::StringVal(s)) = self.parse_value() {
                        loop_mode = Some(s);
                    }
                }
                _ => {
                    self.parse_value()?;
                }
            }
        }
        
        self.expect_token(&Token::RBrace)?;
        
        Ok(AnimationNode {
            name,
            property: property.unwrap_or_default(),
            from_val,
            to_val,
            duration,
            easing,
            loop_mode,
            span: None,
        })
    }
    
    fn parse_timeline(&mut self) -> Result<TimelineNode, Diagnostic> {
        self.advance(); // consume 'timeline'
        
        let name = match self.current() {
            Some(SpannedToken { token: Token::String(n), .. }) |
            Some(SpannedToken { token: Token::SingleQuoteString(n), .. }) |
            Some(SpannedToken { token: Token::Identifier(n), .. }) => {
                let n = n.clone();
                self.advance();
                n
            }
            _ => return Err(self.error("Expected timeline name")),
        };
        
        self.expect_token(&Token::LBrace)?;
        self.skip_block_contents();
        self.expect_token(&Token::RBrace)?;
        
        Ok(TimelineNode {
            name,
            entries: vec![],
            span: None,
        })
    }
    
    fn parse_light(&mut self) -> Result<LightNode, Diagnostic> {
        let light_type = match self.current() {
            Some(SpannedToken { token: Token::DirectionalLight, .. }) => "directional",
            Some(SpannedToken { token: Token::PointLight, .. }) => "point",
            Some(SpannedToken { token: Token::SpotLight, .. }) => "spot",
            Some(SpannedToken { token: Token::AmbientLight, .. }) => "ambient",
            _ => return Err(self.error("Expected light type")),
        };
        self.advance();
        
        let name = match self.current() {
            Some(SpannedToken { token: Token::String(n), .. }) |
            Some(SpannedToken { token: Token::SingleQuoteString(n), .. }) => {
                let n = n.clone();
                self.advance();
                n
            }
            _ => return Err(self.error("Expected light name")),
        };
        
        self.expect_token(&Token::LBrace)?;
        let properties = self.parse_properties()?;
        self.expect_token(&Token::RBrace)?;
        
        Ok(LightNode {
            name,
            light_type: light_type.to_string(),
            properties,
            span: None,
        })
    }
    
    fn parse_camera(&mut self) -> Result<CameraNode, Diagnostic> {
        let camera_type = match self.current() {
            Some(SpannedToken { token: Token::PerspectiveCamera, .. }) => "perspective",
            Some(SpannedToken { token: Token::OrthographicCamera, .. }) => "orthographic",
            _ => return Err(self.error("Expected camera type")),
        };
        self.advance();
        
        let name = match self.current() {
            Some(SpannedToken { token: Token::String(n), .. }) |
            Some(SpannedToken { token: Token::SingleQuoteString(n), .. }) => {
                let n = n.clone();
                self.advance();
                n
            }
            _ => return Err(self.error("Expected camera name")),
        };
        
        self.expect_token(&Token::LBrace)?;
        let properties = self.parse_properties()?;
        self.expect_token(&Token::RBrace)?;
        
        Ok(CameraNode {
            name,
            camera_type: camera_type.to_string(),
            properties,
            span: None,
        })
    }
    
    fn skip_block(&mut self) {
        self.advance(); // consume keyword
        
        // Skip to opening brace
        while let Some(tok) = self.current() {
            if matches!(tok.token, Token::LBrace) {
                break;
            }
            self.advance();
        }
        
        if matches!(self.current(), Some(SpannedToken { token: Token::LBrace, .. })) {
            self.advance();
            self.skip_block_contents();
            self.advance(); // closing brace
        }
    }
    
    fn skip_block_contents(&mut self) {
        let mut depth = 1;
        while let Some(tok) = self.current() {
            match tok.token {
                Token::LBrace => depth += 1,
                Token::RBrace => {
                    depth -= 1;
                    if depth == 0 {
                        return;
                    }
                }
                _ => {}
            }
            self.advance();
        }
    }
    
    fn error(&self, message: &str) -> Diagnostic {
        let (line, col, offset) = match self.current() {
            Some(tok) => {
                let (l, c) = get_line_col(self.source, tok.span.start);
                (l as u32, c as u32, tok.span.start as u32)
            }
            None => (1, 1, self.source.len() as u32),
        };
        
        Diagnostic {
            severity: DiagnosticSeverity::Error,
            message: message.to_string(),
            span: Some(Span {
                start: Position { line, column: col, offset },
                end: Position { line, column: col + 1, offset: offset + 1 },
            }),
            code: Some("E000".to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_parse_simple_composition() {
        let source = r#"composition "Test" {
            object "Cube" @grabbable {
                geometry: "cube"
                position: [0, 1, 0]
            }
        }"#;
        
        let result = parse_holoscript(source);
        assert!(result.is_ok());
        
        let comp = result.unwrap();
        assert_eq!(comp.name, "Test");
        assert_eq!(comp.objects.len(), 1);
        assert_eq!(comp.objects[0].name, "Cube");
        assert_eq!(comp.objects[0].traits, vec!["grabbable"]);
    }
    
    #[test]
    fn test_parse_with_template() {
        let source = r##"composition "Demo" {
            template "Ball" {
                geometry: "sphere"
                color: "#ff0000"
            }

            object "RedBall" using "Ball" {
                position: [0, 2, 0]
            }
        }"##;
        
        let result = parse_holoscript(source);
        assert!(result.is_ok());
        
        let comp = result.unwrap();
        assert_eq!(comp.templates.len(), 1);
        assert_eq!(comp.templates[0].name, "Ball");
        assert_eq!(comp.objects[0].template, Some("Ball".to_string()));
    }
    
    #[test]
    fn test_parse_environment() {
        let source = r#"composition "Scene" {
            environment {
                background: "gradient"
                fog_density: 0.5
            }
        }"#;

        let result = parse_holoscript(source);
        if let Err(ref e) = result {
            eprintln!("Parse error: {:?}", e);
        }
        assert!(result.is_ok());

        let comp = result.unwrap();
        assert!(comp.environment.is_some());
        let env = comp.environment.unwrap();
        // Check properties instead of direct fields
        assert!(env.properties.iter().any(|p| p.name == "background"));
        assert!(env.properties.iter().any(|p| p.name == "fog_density"));
    }
    
    #[test]
    fn test_invalid_syntax_error() {
        let source = r#"composition { }"#; // Missing name
        
        let result = parse_holoscript(source);
        assert!(result.is_err());
    }
    
    #[test]
    fn test_parse_nested_objects() {
        let source = r#"composition "Robot" {
            object "Body" @physics {
                geometry: "cube"
                scale: [0.6, 0.8, 0.3]
                object "Head" {
                    geometry: "sphere"
                    position: [0, 0.6, 0]
                    scale: [0.4, 0.4, 0.4]
                }
                object "LeftArm" {
                    geometry: "cylinder"
                    position: [-0.5, 0, 0]
                }
            }
        }"#;
        
        let result = parse_holoscript(source);
        assert!(result.is_ok(), "Parse failed: {:?}", result.err());
        
        let comp = result.unwrap();
        assert_eq!(comp.objects.len(), 1);
        assert_eq!(comp.objects[0].name, "Body");
        
        // Verify children_json is populated
        let children_json = &comp.objects[0].children_json;
        assert!(!children_json.is_empty(), "children_json should not be empty");
        
        // Verify JSON is valid and contains both children
        let children: Vec<serde_json::Value> = serde_json::from_str(children_json).unwrap();
        assert_eq!(children.len(), 2);
        assert_eq!(children[0]["name"], "Head");
        assert_eq!(children[1]["name"], "LeftArm");
    }
    
    #[test]
    fn test_parse_keyframes() {
        let source = r#"composition "AnimTest" {
            object "Spinner" {
                geometry: "cube"
                position: [0, 1, 0]
                
                keyframes "rotate" {
                    0%: { rotation: [0, 0, 0] }
                    50%: { rotation: [0, 180, 0] }
                    100%: { rotation: [0, 360, 0] }
                    duration: 2000
                    easing: "ease-in-out"
                    loop: true
                }
            }
        }"#;
        
        let result = parse_holoscript(source);
        assert!(result.is_ok(), "Parse failed: {:?}", result.err());
        
        let comp = result.unwrap();
        assert_eq!(comp.objects.len(), 1);
        assert_eq!(comp.objects[0].name, "Spinner");
        
        // Verify children_json contains keyframes data
        let cj = &comp.objects[0].children_json;
        assert!(!cj.is_empty(), "children_json should contain keyframes");
        
        let parsed: serde_json::Value = serde_json::from_str(cj).unwrap();
        
        // Should have __keyframes array
        let keyframes = parsed["__keyframes"].as_array().expect("should have __keyframes array");
        assert_eq!(keyframes.len(), 1);
        assert_eq!(keyframes[0]["name"], "rotate");
        assert_eq!(keyframes[0]["duration"], 2000);
        assert_eq!(keyframes[0]["easing"], "ease-in-out");
        assert_eq!(keyframes[0]["loop"], true);
        
        // Check stops
        let stops = keyframes[0]["stops"].as_array().expect("should have stops");
        assert_eq!(stops.len(), 3);
        assert_eq!(stops[0]["percent"], 0.0);
        assert_eq!(stops[1]["percent"], 50.0);
        assert_eq!(stops[2]["percent"], 100.0);
    }
}
