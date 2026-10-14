//! Running a flow against a host.
//!
//! `yaak-flows` knows how to walk a graph and nothing about sending requests or reading
//! JSONPath/XPath. [`FlowHost`] names the two operations it leans on a host for, and
//! [`HostFlowExecutor`] adapts them to the engine's [`FlowExecutor`], so the walk is shared by
//! every host that can answer them.

use crate::error::Result;
use crate::host::PluginHost;
use serde_json::Value;
use std::collections::HashMap;
use std::future::Future;
use yaak_flows::{Flow, FlowExecutor, FlowRunResult, HttpOutcome};
use yaak_models::render::make_vars_hashmap;
use yaak_plugins::events::{FilterResponse, RenderPurpose};
use yaak_rpc_schema::CmdRunFlowReq;
use yaak_templates::TemplateCallback;

/// A host that can send a collection request and run the plugin filters.
///
/// Like [`PluginHost`], these are operations rather than handles: sending needs a connection
/// manager and the plugin runtime, which only the desktop holds as concrete types.
pub trait FlowHost: PluginHost {
    /// Send the request `request_id` under `environment_id` and return its status and body.
    ///
    /// The whole flow runs under one environment; the flow's own variables do not yet feed into
    /// the request render.
    fn send_flow_request(
        &self,
        request_id: &str,
        environment_id: Option<&str>,
    ) -> impl Future<Output = Result<HttpOutcome>>;

    /// `PluginManager::filter_data`: picks the XPath or JSONPath plugin by content type.
    fn filter_data(
        &self,
        filter: &str,
        content: &str,
        content_type: &str,
    ) -> impl Future<Output = Result<FilterResponse>>;
}

pub struct HostFlowExecutor<'a, H: FlowHost> {
    host: &'a H,
    environment_id: Option<&'a str>,
}

impl<'a, H: FlowHost> HostFlowExecutor<'a, H> {
    pub fn new(host: &'a H, environment_id: Option<&'a str>) -> Self {
        Self { host, environment_id }
    }
}

impl<H: FlowHost> FlowExecutor for HostFlowExecutor<'_, H> {
    async fn send_request(
        &self,
        request_id: &str,
        _vars: &HashMap<String, String>,
    ) -> yaak_flows::Result<HttpOutcome> {
        self.host
            .send_flow_request(request_id, self.environment_id)
            .await
            .map_err(|e| yaak_flows::Error::Request(e.to_string()))
    }

    async fn filter(
        &self,
        filter: &str,
        content: &str,
        content_type: &str,
    ) -> yaak_flows::Result<String> {
        let resp = self
            .host
            .filter_data(filter, content, content_type)
            .await
            .map_err(|e| yaak_flows::Error::Extract(e.to_string()))?;
        if let Some(err) = resp.error {
            return Err(yaak_flows::Error::Extract(err));
        }
        first_match(&resp.content).ok_or_else(|| yaak_flows::Error::Extract("No match".into()))
    }
}

/// The JSONPath plugin answers with a JSON array of matches and the XPath plugin with one match
/// per line. Take the first, as text.
fn first_match(content: &str) -> Option<String> {
    if let Ok(Value::Array(items)) = serde_json::from_str::<Value>(content) {
        return items.into_iter().next().map(|v| match v {
            Value::String(s) => s,
            v => v.to_string(),
        });
    }
    let first = content.lines().next()?;
    Some(first.to_string())
}

pub async fn cmd_run_flow<H: FlowHost>(host: H, req: CmdRunFlowReq) -> Result<FlowRunResult> {
    run_flow_in_workspace(&host, &req.flow, &req.workspace_id, req.environment_id.as_deref()).await
}

/// Run `flow` with the workspace's active environment as the starting variables.
pub async fn run_flow_in_workspace<H: FlowHost>(
    host: &H,
    flow: &Flow,
    workspace_id: &str,
    environment_id: Option<&str>,
) -> Result<FlowRunResult> {
    let chain = host.db().resolve_environments(workspace_id, None, environment_id)?;
    let vars = make_vars_hashmap(chain);
    let cb = host.template_callback(RenderPurpose::Send).await?;
    run_with(host, flow, vars, environment_id, &cb).await
}

async fn run_with<H: FlowHost, T: TemplateCallback>(
    host: &H,
    flow: &Flow,
    vars: HashMap<String, String>,
    environment_id: Option<&str>,
    cb: &T,
) -> Result<FlowRunResult> {
    yaak_flows::run_flow(flow, vars, cb, &HostFlowExecutor::new(host, environment_id))
        .await
        .map_err(|e| crate::Error::Generic(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::first_match;

    #[test]
    fn jsonpath_array() {
        assert_eq!(first_match("[\n  \"a\",\n  \"b\"\n]").as_deref(), Some("a"));
        assert_eq!(first_match("[1]").as_deref(), Some("1"));
        assert_eq!(first_match("[]"), None);
    }

    #[test]
    fn xpath_lines() {
        assert_eq!(first_match("x\ny").as_deref(), Some("x"));
        assert_eq!(first_match(""), None);
    }
}
