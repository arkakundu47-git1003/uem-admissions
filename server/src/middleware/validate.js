// validate(schema, 'body' | 'query' | 'params') - replaces the request part with the parsed, typed value.
export const validate =
  (schema, part = 'body') =>
  (req, res, next) => {
    try {
      req[part] = schema.parse(req[part]);
      next();
    } catch (err) {
      next(err);
    }
  };
