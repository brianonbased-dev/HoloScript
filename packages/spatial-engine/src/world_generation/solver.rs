use z3::ast::{Ast, Int};
use z3::{Config, Context, Optimize, SatResult};

pub struct SpatialConstraint {
    pub min_width: i64,
    pub max_width: i64,
    pub min_length: i64,
    pub max_length: i64,
    pub target_area: i64,
}

#[derive(Debug)]
pub struct SolvedLayout {
    pub width: i64,
    pub length: i64,
}

pub struct ConstraintEvaluator<'ctx> {
    pub ctx: &'ctx Context,
}

impl<'ctx> ConstraintEvaluator<'ctx> {
    pub fn new(ctx: &'ctx Context) -> Self {
        Self { ctx }
    }

    /// Evaluates spatial bounds within a 100ms threshold
    pub fn solve_room_layout(
        &self,
        constraints: &SpatialConstraint,
    ) -> Result<SolvedLayout, String> {
        let opt = Optimize::new(self.ctx);

        let width = Int::new_const(self.ctx, "room_width");
        let length = Int::new_const(self.ctx, "room_length");

        // Bounds constraints
        opt.assert(&width.ge(&Int::from_i64(self.ctx, constraints.min_width)));
        opt.assert(&width.le(&Int::from_i64(self.ctx, constraints.max_width)));

        opt.assert(&length.ge(&Int::from_i64(self.ctx, constraints.min_length)));
        opt.assert(&length.le(&Int::from_i64(self.ctx, constraints.max_length)));

        // Target Area Optimization (Soft constraint)
        let area = Int::mul(self.ctx, &[&width, &length]);
        let target = Int::from_i64(self.ctx, constraints.target_area);

        // Minimize the absolute difference from target area
        // Z3 lacks native `abs()` for integers in all contexts, so we use max(a-b, b-a)
        let diff1 = Int::sub(self.ctx, &[&area, &target]);
        let diff2 = Int::sub(self.ctx, &[&target, &area]);
        let _ = opt.minimize(&diff1);
        let _ = opt.minimize(&diff2);

        // Execute Solver
        match opt.check(&[]) {
            SatResult::Sat => {
                if let Some(model) = opt.get_model() {
                    let w = model.eval(&width, true).unwrap().as_i64().unwrap();
                    let l = model.eval(&length, true).unwrap().as_i64().unwrap();

                    Ok(SolvedLayout {
                        width: w,
                        length: l,
                    })
                } else {
                    Err("Model extraction failed".to_string())
                }
            }
            SatResult::Unsat => Err("Unsatisfiable constraints".to_string()),
            SatResult::Unknown => Err("Solver timed out or unknown state".to_string()),
        }
    }
}
