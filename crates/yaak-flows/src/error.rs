use thiserror::Error;

#[derive(Error, Debug)]
pub enum Error {
    #[error("Flow has no start node")]
    NoStartNode,

    #[error("Node \"{0}\" does not exist in the flow")]
    NodeNotFound(String),

    #[error("Flow exceeded the maximum of {0} node executions (possible loop)")]
    MaxStepsExceeded(usize),

    #[error("Template error: {0}")]
    Template(#[from] yaak_templates::error::Error),

    #[error("Request error: {0}")]
    Request(String),

    #[error("Extract error: {0}")]
    Extract(String),
}

pub type Result<T> = std::result::Result<T, Error>;
