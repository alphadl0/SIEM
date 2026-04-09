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
    [Route("api/[controller]")]
    [Authorize(Policy = "SecurityTeamPolicy")]
    public class AlertsController : ControllerBase
    {
        private readonly AlertHistoryService _historyService;
        private readonly ILogger<AlertsController> _logger;

        public AlertsController(AlertHistoryService historyService, ILogger<AlertsController> logger)
        {
            _historyService = historyService;
            _logger = logger;
        }

        [HttpGet]
        public async Task<IActionResult> GetAlerts([FromQuery] int? page, [FromQuery] int? pageSize, [FromQuery] bool? excludeAzure, CancellationToken cancellationToken)
        {
            _logger.LogInformation("Fetch alerts: page={Page}, size={Size}, excludeAzure={ExcludeAzure}", page, pageSize, excludeAzure);
            var normalizedPage = helpers.QueryHelper.NormalizePage(page);
            var normalizedPageSize = helpers.QueryHelper.NormalizePageSize(pageSize, 25);
            var result = await _historyService.GetPagedAlertsAsync(normalizedPage, normalizedPageSize, excludeAzure, cancellationToken);
            return Ok(result);
        }
    }
}