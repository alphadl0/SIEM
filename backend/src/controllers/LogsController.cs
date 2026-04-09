using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using backend.src.services;
using Microsoft.Extensions.Logging;

namespace backend.src.controllers
{
    [ApiController]
    [Route("api")]
    [Authorize(Policy = "SecurityTeamPolicy")]
    public class LogsController : ControllerBase
    {
        private readonly LogQueryService _logQueryService;
        private readonly ILogger<LogsController> _logger;

        public LogsController(LogQueryService logQueryService, ILogger<LogsController> logger)
        {
            _logQueryService = logQueryService;
            _logger = logger;
        }

        [HttpGet("signin-logs")]
        public async Task<IActionResult> GetSigninLogs([FromQuery] int? page, [FromQuery] int? pageSize, CancellationToken cancellationToken)
        {
            _logger.LogInformation("Fetch signin-logs: page={Page}, size={Size}", page, pageSize);
            try
            {
                var result = await _logQueryService.GetSigninLogsAsync(page, pageSize, cancellationToken);
                if (result == null) return Problem("Workspace ID is not configured.");
                return Ok(result);
            }
            catch (Azure.RequestFailedException ex)
            {
                _logger.LogError(ex, "Failed to query sign-in logs");
                return Problem(
                    statusCode: ex.Status == 429 ? 429 : 502,
                    title: "Log Analytics query failed",
                    detail: ex.Message);
            }
        }

        [HttpGet("audit-logs")]
        public async Task<IActionResult> GetAuditLogs([FromQuery] int? page, [FromQuery] int? pageSize, CancellationToken cancellationToken)
        {
            _logger.LogInformation("Fetch audit-logs: page={Page}, size={Size}", page, pageSize);
            try
            {
                var result = await _logQueryService.GetAuditLogsAsync(page, pageSize, cancellationToken);
                if (result == null) return Problem("Workspace ID is not configured.");
                return Ok(result);
            }
            catch (Azure.RequestFailedException ex)
            {
                _logger.LogError(ex, "Failed to query audit logs");
                return Problem(
                    statusCode: ex.Status == 429 ? 429 : 502,
                    title: "Log Analytics query failed",
                    detail: ex.Message);
            }
        }

        [HttpGet("schema")]
        public async Task<IActionResult> GetSchema(CancellationToken cancellationToken)
        {
            _logger.LogInformation("Fetch log schema");
            var result = await _logQueryService.GetSchemaAsync(cancellationToken);
            if (result == null) return Problem("Workspace ID not configured or API request failed.");
            return Content(result, "application/json");
        }

        [HttpPost("search")]
        public async Task<IActionResult> Search([FromBody] SearchRequest req, CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(req?.Query))
                return BadRequest("Query is required.");

            try
            {
                var result = await _logQueryService.ExecuteSearchAsync(req.Query, cancellationToken);
                if (result == null) return Problem("Workspace ID is not configured.");
                return Ok(result);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(ex.Message);
            }
            catch (Azure.RequestFailedException ex)
            {
                _logger.LogError(ex, "Search query failed");
                return Problem(
                    statusCode: ex.Status == 429 ? 429 : 502,
                    title: "Log Analytics query failed",
                    detail: ex.Message);
            }
        }

        [HttpGet("process-logs")]
        public async Task<IActionResult> GetProcessLogs(CancellationToken cancellationToken)
        {
            _logger.LogInformation("Fetch process logs");
            try
            {
                var result = await _logQueryService.GetProcessLogsAsync(cancellationToken);
                if (result == null) return Problem("Workspace ID is not configured.");
                return Ok(result);
            }
            catch (Azure.RequestFailedException ex)
            {
                _logger.LogError(ex, "Failed to query process logs");
                return Problem(
                    statusCode: ex.Status == 429 ? 429 : 502,
                    title: "Log Analytics query failed",
                    detail: ex.Message);
            }
        }
    }

    public record SearchRequest(string Query);
}